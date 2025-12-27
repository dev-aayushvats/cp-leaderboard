import { Space_Mono } from "next/font/google";
import "./globals.css";

// Configure the font
const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"], // Regular and Bold
  variable: "--font-space-mono", // Define a CSS variable
  display: "swap",
});

export const metadata = {
  title: "Competitive Leaderboard",
  description: "Global coding rankings",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${spaceMono.variable} font-mono antialiased bg-dark-bg text-gray-200`}>
        {children}
      </body>
    </html>
  );
}