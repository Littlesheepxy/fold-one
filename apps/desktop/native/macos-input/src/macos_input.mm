#include <node_api.h>

#include <string>

#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>

#include <unistd.h>

namespace {

pid_t target_pid = 0;
AXUIElementRef target_element = nullptr;

void clear_target() {
	if (target_element != nullptr) {
		CFRelease(target_element);
		target_element = nullptr;
	}
	target_pid = 0;
}

napi_value make_object(napi_env env) {
	napi_value value;
	napi_create_object(env, &value);
	return value;
}

void set_bool(napi_env env, napi_value object, const char* key, bool input) {
	napi_value value;
	napi_get_boolean(env, input, &value);
	napi_set_named_property(env, object, key, value);
}

void set_int(napi_env env, napi_value object, const char* key, int64_t input) {
	napi_value value;
	napi_create_int64(env, input, &value);
	napi_set_named_property(env, object, key, value);
}

void set_string(napi_env env, napi_value object, const char* key, NSString* input) {
	if (input == nil) return;
	const char* utf8 = input.UTF8String;
	if (utf8 == nullptr) return;
	napi_value value;
	napi_create_string_utf8(env, utf8, NAPI_AUTO_LENGTH, &value);
	napi_set_named_property(env, object, key, value);
}

NSString* ax_string(AXUIElementRef element, CFStringRef attribute) {
	if (element == nullptr) return nil;
	CFTypeRef raw = nullptr;
	if (AXUIElementCopyAttributeValue(element, attribute, &raw) != kAXErrorSuccess || raw == nullptr) {
		return nil;
	}
	NSString* value = nil;
	if (CFGetTypeID(raw) == CFStringGetTypeID()) {
		value = [(__bridge NSString*)raw copy];
	}
	CFRelease(raw);
	return value;
}

bool is_settable(AXUIElementRef element, CFStringRef attribute) {
	Boolean settable = false;
	return element != nullptr &&
		AXUIElementIsAttributeSettable(element, attribute, &settable) == kAXErrorSuccess && settable;
}

napi_value capture_target(napi_env env, napi_callback_info info) {
	@autoreleasepool {
		clear_target();
		napi_value result = make_object(env);
		const bool trusted = AXIsProcessTrusted();
		set_bool(env, result, "accessibilityTrusted", trusted);

		NSRunningApplication* frontmost = NSWorkspace.sharedWorkspace.frontmostApplication;
		if (frontmost == nil || frontmost.processIdentifier <= 0) {
			set_bool(env, result, "ok", false);
			set_string(env, result, "error", @"frontmost-application-unavailable");
			return result;
		}

		target_pid = frontmost.processIdentifier;
		set_int(env, result, "pid", target_pid);
		set_string(env, result, "appName", frontmost.localizedName);
		set_string(env, result, "bundleId", frontmost.bundleIdentifier);

		if (!trusted) {
			set_bool(env, result, "ok", false);
			set_bool(env, result, "editable", false);
			set_string(env, result, "error", @"accessibility-not-trusted");
			return result;
		}

		AXUIElementRef application = AXUIElementCreateApplication(target_pid);
		CFTypeRef focused = nullptr;
		const AXError error = AXUIElementCopyAttributeValue(
			application,
			kAXFocusedUIElementAttribute,
			&focused
		);
		CFRelease(application);
		if (error != kAXErrorSuccess || focused == nullptr) {
			set_bool(env, result, "ok", true);
			set_bool(env, result, "editable", false);
			set_string(env, result, "error", @"focused-element-unavailable");
			return result;
		}

		target_element = (AXUIElementRef)focused;
		NSString* role = ax_string(target_element, kAXRoleAttribute);
		set_string(env, result, "role", role);
		const bool editable = is_settable(target_element, kAXValueAttribute) ||
			is_settable(target_element, kAXSelectedTextAttribute) ||
			is_settable(target_element, kAXSelectedTextRangeAttribute);
		set_bool(env, result, "editable", editable);
		set_bool(env, result, "ok", true);
		return result;
	}
}

napi_value clear_target_js(napi_env env, napi_callback_info info) {
	clear_target();
	napi_value value;
	napi_get_undefined(env, &value);
	return value;
}

napi_value inspect_target(napi_env env, napi_callback_info info) {
	@autoreleasepool {
		napi_value result = make_object(env);
		if (target_element == nullptr) {
			set_bool(env, result, "available", false);
			return result;
		}

		bool available = false;
		CFTypeRef value = nullptr;
		if (AXUIElementCopyAttributeValue(target_element, kAXValueAttribute, &value) == kAXErrorSuccess && value != nullptr) {
			if (CFGetTypeID(value) == CFStringGetTypeID()) {
				NSString* text = (__bridge NSString*)value;
				set_int(env, result, "length", text.length);
				available = true;
			}
			CFRelease(value);
		}

		CFTypeRef range_value = nullptr;
		if (AXUIElementCopyAttributeValue(target_element, kAXSelectedTextRangeAttribute, &range_value) == kAXErrorSuccess && range_value != nullptr) {
			if (CFGetTypeID(range_value) == AXValueGetTypeID()) {
				CFRange range = CFRangeMake(0, 0);
				if (AXValueGetValue(
					(AXValueRef)range_value,
					(AXValueType)kAXValueCFRangeType,
					&range
				)) {
					set_int(env, result, "selectedLocation", range.location);
					set_int(env, result, "selectedLength", range.length);
					available = true;
				}
			}
			CFRelease(range_value);
		}

		set_bool(env, result, "available", available);
		return result;
	}
}

void post_key_event(pid_t pid, CGKeyCode key_code, bool key_down, CGEventFlags flags) {
	CGEventRef event = CGEventCreateKeyboardEvent(nullptr, key_code, key_down);
	if (event == nullptr) return;
	CGEventSetFlags(event, flags);
	CGEventPostToPid(pid, event);
	CFRelease(event);
}

napi_value post_paste(napi_env env, napi_callback_info info) {
	@autoreleasepool {
		napi_value result = make_object(env);
		if (!AXIsProcessTrusted()) {
			set_bool(env, result, "ok", false);
			set_string(env, result, "error", @"accessibility-not-trusted");
			return result;
		}
		if (target_pid <= 0) {
			set_bool(env, result, "ok", false);
			set_string(env, result, "error", @"target-not-captured");
			return result;
		}

		NSRunningApplication* application = [NSRunningApplication runningApplicationWithProcessIdentifier:target_pid];
		if (application == nil || application.terminated) {
			set_bool(env, result, "ok", false);
			set_string(env, result, "error", @"target-application-not-running");
			return result;
		}

		bool focus_restored = false;
		if (!application.active) {
			[application activateWithOptions:NSApplicationActivateIgnoringOtherApps];
			usleep(140000);
		}
		if (target_element != nullptr) {
			const AXError focus_error = AXUIElementSetAttributeValue(
				target_element,
				kAXFocusedAttribute,
				kCFBooleanTrue
			);
			focus_restored = focus_error == kAXErrorSuccess;
			if (focus_restored) usleep(30000);
		}

		constexpr CGKeyCode command_key = 55;
		constexpr CGKeyCode v_key = 9;
		post_key_event(target_pid, command_key, true, kCGEventFlagMaskCommand);
		post_key_event(target_pid, v_key, true, kCGEventFlagMaskCommand);
		post_key_event(target_pid, v_key, false, kCGEventFlagMaskCommand);
		post_key_event(target_pid, command_key, false, 0);

		set_bool(env, result, "ok", true);
		set_int(env, result, "pid", target_pid);
		set_bool(env, result, "focusRestored", focus_restored);
		return result;
	}
}

napi_value insert_text_direct(napi_env env, napi_callback_info info) {
	@autoreleasepool {
		napi_value result = make_object(env);
		size_t argc = 1;
		napi_value args[1];
		napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
		if (argc != 1 || target_element == nullptr) {
			set_bool(env, result, "ok", false);
			set_string(env, result, "error", @"target-element-unavailable");
			return result;
		}

		size_t length = 0;
		if (napi_get_value_string_utf8(env, args[0], nullptr, 0, &length) != napi_ok) {
			set_bool(env, result, "ok", false);
			set_string(env, result, "error", @"invalid-text");
			return result;
		}
		std::string utf8(length + 1, '\0');
		napi_get_value_string_utf8(env, args[0], utf8.data(), utf8.size(), &length);
		NSString* text = [[NSString alloc] initWithBytes:utf8.data()
			length:length
			encoding:NSUTF8StringEncoding];
		if (text == nil || !is_settable(target_element, kAXSelectedTextAttribute)) {
			set_bool(env, result, "ok", false);
			set_string(env, result, "error", @"selected-text-not-settable");
			return result;
		}

		const AXError error = AXUIElementSetAttributeValue(
			target_element,
			kAXSelectedTextAttribute,
			(__bridge CFStringRef)text
		);
		set_bool(env, result, "ok", error == kAXErrorSuccess);
		if (error != kAXErrorSuccess) {
			set_string(env, result, "error", [NSString stringWithFormat:@"ax-error-%d", error]);
		}
		return result;
	}
}

napi_value pasteboard_change_count(napi_env env, napi_callback_info info) {
	@autoreleasepool {
		napi_value value;
		napi_create_int64(env, NSPasteboard.generalPasteboard.changeCount, &value);
		return value;
	}
}

napi_value idle_seconds(napi_env env, napi_callback_info info) {
	@autoreleasepool {
		const CFTimeInterval seconds =
			CGEventSourceSecondsSinceLastEventType(kCGEventSourceStateHIDSystemState, kCGAnyInputEventType);
		napi_value value;
		napi_create_double(env, seconds, &value);
		return value;
	}
}

// MARK: - 前台切换事件驱动监听（NSWorkspace.didActivateApplicationNotification）

napi_threadsafe_function watch_tsfn = nullptr;
napi_ref watch_cb_ref = nullptr;
napi_env watch_env = nullptr;
id watch_observer = nullptr;

struct WatchPayload {
	std::string app_name;
	std::string bundle_id;
	std::string app_path;
	pid_t pid;
};

void watch_js_call(napi_env env, napi_value js_cb, void* /*context*/, void* data) {
	WatchPayload* payload = static_cast<WatchPayload*>(data);
	if (payload == nullptr) return;
	@autoreleasepool {
		napi_value result;
		napi_create_object(env, &result);
		napi_value v;
		napi_create_string_utf8(env, payload->app_name.c_str(), NAPI_AUTO_LENGTH, &v);
		napi_set_named_property(env, result, "appName", v);
		napi_create_string_utf8(env, payload->bundle_id.c_str(), NAPI_AUTO_LENGTH, &v);
		napi_set_named_property(env, result, "bundleId", v);
		napi_create_string_utf8(env, payload->app_path.c_str(), NAPI_AUTO_LENGTH, &v);
		napi_set_named_property(env, result, "appPath", v);
		napi_create_int64(env, payload->pid, &v);
		napi_set_named_property(env, result, "pid", v);
		napi_value undefined;
		napi_get_undefined(env, &undefined);
		napi_call_function(env, undefined, js_cb, 1, &result, nullptr);
	}
	delete payload;
}

void post_front_app_change(NSRunningApplication* app) {
	if (watch_tsfn == nullptr || app == nil) return;
	WatchPayload* payload = new WatchPayload();
	NSString* name = app.localizedName ?: @"";
	NSString* bundle = app.bundleIdentifier ?: @"";
	NSString* path = app.bundleURL.path ?: @"";
	payload->app_name = name.UTF8String;
	payload->bundle_id = bundle.UTF8String;
	payload->app_path = path.UTF8String;
	payload->pid = app.processIdentifier;
	// non-blocking：回调队列满时丢弃，下一帧激活事件会再补
	napi_call_threadsafe_function(watch_tsfn, payload, napi_tsfn_nonblocking);
}

void clear_watch(napi_env env) {
	if (watch_observer != nullptr) {
		[NSNotificationCenter.defaultCenter removeObserver:watch_observer];
		watch_observer = nullptr;
	}
	if (watch_tsfn != nullptr) {
		napi_release_threadsafe_function(watch_tsfn, napi_tsfn_abort);
		watch_tsfn = nullptr;
	}
	if (watch_cb_ref != nullptr) {
		napi_delete_reference(env, watch_cb_ref);
		watch_cb_ref = nullptr;
	}
	watch_env = nullptr;
}

napi_value start_front_app_watch(napi_env env, napi_callback_info info) {
	@autoreleasepool {
		napi_value result = make_object(env);
		size_t argc = 1;
		napi_value args[1];
		napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
		if (argc != 1) {
			set_bool(env, result, "ok", false);
			set_string(env, result, "error", @"callback-required");
			return result;
		}
		napi_valuetype arg_type;
		napi_typeof(env, args[0], &arg_type);
		if (arg_type != napi_function) {
			set_bool(env, result, "ok", false);
			set_string(env, result, "error", @"callback-must-be-function");
			return result;
		}
		if (watch_tsfn != nullptr) {
			set_bool(env, result, "ok", true);
			set_bool(env, result, "alreadyWatching", true);
			return result;
		}

		watch_env = env;
		napi_create_reference(env, args[0], 1, &watch_cb_ref);

		napi_value resource_name;
		napi_create_string_utf8(env, "fold-front-app-watch", NAPI_AUTO_LENGTH, &resource_name);
		const napi_status status = napi_create_threadsafe_function(
			env,
			args[0],
			nullptr,
			resource_name,
			0,
			1,
			nullptr,
			nullptr,
			nullptr,
			watch_js_call,
			&watch_tsfn
		);
		if (status != napi_ok) {
			clear_watch(env);
			set_bool(env, result, "ok", false);
			set_string(env, result, "error", @"tsfn-create-failed");
			return result;
		}

		watch_observer = [NSNotificationCenter.defaultCenter
			addObserverForName:NSWorkspaceDidActivateApplicationNotification
			object:nil
			queue:nil
			usingBlock:^(NSNotification* note) {
				NSRunningApplication* app = note.userInfo[NSWorkspaceApplicationKey];
				post_front_app_change(app);
			}];

		set_bool(env, result, "ok", true);
		return result;
	}
}

napi_value stop_front_app_watch(napi_env env, napi_callback_info info) {
	clear_watch(env);
	napi_value value;
	napi_get_undefined(env, &value);
	return value;
}

napi_value init(napi_env env, napi_value exports) {
	napi_property_descriptor properties[] = {
		{"captureTarget", nullptr, capture_target, nullptr, nullptr, nullptr, napi_default, nullptr},
		{"clearTarget", nullptr, clear_target_js, nullptr, nullptr, nullptr, napi_default, nullptr},
		{"inspectTarget", nullptr, inspect_target, nullptr, nullptr, nullptr, napi_default, nullptr},
		{"postPaste", nullptr, post_paste, nullptr, nullptr, nullptr, napi_default, nullptr},
		{"insertTextDirect", nullptr, insert_text_direct, nullptr, nullptr, nullptr, napi_default, nullptr},
		{"pasteboardChangeCount", nullptr, pasteboard_change_count, nullptr, nullptr, nullptr, napi_default, nullptr},
		{"idleSeconds", nullptr, idle_seconds, nullptr, nullptr, nullptr, napi_default, nullptr},
		{"startFrontAppWatch", nullptr, start_front_app_watch, nullptr, nullptr, nullptr, napi_default, nullptr},
		{"stopFrontAppWatch", nullptr, stop_front_app_watch, nullptr, nullptr, nullptr, napi_default, nullptr},
	};
	napi_define_properties(env, exports, sizeof(properties) / sizeof(properties[0]), properties);
	return exports;
}

}  // namespace

NAPI_MODULE(NODE_GYP_MODULE_NAME, init)
