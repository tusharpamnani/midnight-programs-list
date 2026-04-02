import type { Metadata } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Midnight Coin Flip | Provably Fair",
  description: "A cryptographically secure, zero-trust coin flip on the Midnight blockchain.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} font-sans antialiased bg-[#030303] text-foreground selection:bg-purple-500/30`}
      >
        <div className="fixed inset-0 z-[-1] bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-20 pointer-events-none mix-blend-screen"></div>
        <div className="fixed inset-0 z-[-2] bg-gradient-to-br from-purple-900/10 via-[#030303] to-blue-900/10 pointer-events-none"></div>
        {children}
      </body>
    </html>
  );
}
