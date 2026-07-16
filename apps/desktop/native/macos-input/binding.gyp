{
	"targets": [
		{
			"target_name": "fold_macos_input",
			"sources": ["src/macos_input.mm"],
			"conditions": [
				["OS=='mac'", {
					"xcode_settings": {
						"CLANG_ENABLE_OBJC_ARC": "YES",
						"MACOSX_DEPLOYMENT_TARGET": "12.0"
					},
					"link_settings": {
						"libraries": [
							"-framework AppKit",
							"-framework ApplicationServices"
						]
					}
				}]
			]
		}
	]
}
