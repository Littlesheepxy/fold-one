import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const zhigengWordmark = localFont({
	src: "../public/brand/fonts/zhigeng-wordmark.woff2",
	variable: "--font-zhigeng-wordmark",
	display: "swap",
});

export const metadata: Metadata = {
	title: "知更 · 懂你正在做什么的 AI 语音输入",
	description:
		"知更是懂你正在做什么的 AI 语音输入。听懂你的话，也读懂你的当下。开口即成稿，说到就做到。",
	icons: {
		icon: "/zhigeng-favicon.png",
	},
	openGraph: {
		title: "知更 · 懂你正在做什么的 AI 语音输入",
		description: "知你所言，才更懂你意。听懂你的话，也读懂你的当下。开口即成稿，说到就做到。",
		type: "website",
	},
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="zh-CN" className={zhigengWordmark.variable}>
			<body>{children}</body>
		</html>
	);
}
