import assert from "node:assert/strict";
import { normalizeOfficeCliArgs } from "./index.js";

assert.deepEqual(
	normalizeOfficeCliArgs("feishu", [
		"api",
		"POST",
		"/open-apis/im/v1/messages?receive_id_type=open_id&urgent=true",
		"--data",
		"{}",
	]),
	[
		"api",
		"POST",
		"/open-apis/im/v1/messages",
		"--data",
		"{}",
		"--params",
		'{"receive_id_type":"open_id","urgent":"true"}',
	],
);

assert.deepEqual(
	normalizeOfficeCliArgs("feishu", [
		"api",
		"GET",
		"/open-apis/example?limit=10",
		"--params",
		'{"limit":20,"page_token":"next"}',
	]),
	[
		"api",
		"GET",
		"/open-apis/example",
		"--params",
		'{"limit":"20","page_token":"next"}',
	],
);

assert.deepEqual(
	normalizeOfficeCliArgs("feishu", ["api", "GET", "/open-apis/example", "--query", '{"a":1}']),
	["api", "GET", "/open-apis/example", "--params", '{"a":1}'],
);

assert.deepEqual(normalizeOfficeCliArgs("dingtalk", ["api", "GET", "/x?a=1"]), [
	"api",
	"GET",
	"/x?a=1",
]);

console.log("office args self-check passed");
