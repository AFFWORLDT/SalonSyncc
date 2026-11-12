import { Google_Sans_Code, IBM_Plex_Sans_Arabic, Inter, Manrope } from "next/font/google";

// The site's faces: Manrope for headings, Inter for text, Google Sans Code for numbers and small uppercase labels.
// Exposed as CSS variables consumed by globals.css.
const manrope = Manrope({ variable: "--font-display", subsets: ["latin"], display: "swap" });
const inter = Inter({ variable: "--font-body", subsets: ["latin"], display: "swap" });
const sansCode = Google_Sans_Code({ variable: "--font-gsc", subsets: ["latin"], display: "swap", preload: false });

export const appFontClassName = `${manrope.variable} ${inter.variable} ${sansCode.variable}`;

// The Arabic page's face (/ar/): IBM Plex Sans Arabic for Arabic text; Manrope and Inter still cover Latin words and numbers.
const plexArabic = IBM_Plex_Sans_Arabic({ variable: "--font-ar", subsets: ["arabic"], weight: ["400", "500", "600", "700"], display: "swap" });
export const arabicFontClassName = `${plexArabic.variable} ${manrope.variable} ${inter.variable} ${sansCode.variable}`;
