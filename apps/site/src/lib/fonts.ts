import { Google_Sans_Code, Google_Sans_Flex, IBM_Plex_Sans_Arabic } from "next/font/google";

// The app's faces: Flex for text and headings, Code for numbers, ids and
// uppercase labels. Exposed as CSS variables consumed by app-theme.css.
const sansFlex = Google_Sans_Flex({ variable: "--font-gsf", subsets: ["latin"], display: "swap" });
const sansCode = Google_Sans_Code({ variable: "--font-gsc", subsets: ["latin"], display: "swap" });

export const appFontClassName = `${sansFlex.variable} ${sansCode.variable}`;

// The Arabic page's face (/ar/): IBM Plex Sans Arabic for Arabic text, Flex still covers Latin words and numbers.
const plexArabic = IBM_Plex_Sans_Arabic({ variable: "--font-ar", subsets: ["arabic"], weight: ["400", "500", "600", "700"], display: "swap" });
export const arabicFontClassName = `${plexArabic.variable} ${sansFlex.variable} ${sansCode.variable}`;
