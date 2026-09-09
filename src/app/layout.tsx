import type { Metadata } from "next";
import Image from "next/image";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Alpaca Health",
  description: "Authorization cycle prototype",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="border-b border-zinc-200 bg-white">
          <div className="flex h-14 items-center justify-center px-4">
            <Image
              src="/images/logo.png"
              alt="Alpaca Health"
              width={792}
              height={124}
              priority
              className="h-8 w-auto"
            />
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
