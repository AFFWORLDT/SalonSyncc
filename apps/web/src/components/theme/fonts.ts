import { Google_Sans_Code, Google_Sans_Flex } from "next/font/google";

// The app's faces: Flex for text and headings, Code for numbers, ids and
// uppercase labels. Exposed as CSS variables consumed by app-theme.css.
const sansFlex = Google_Sans_Flex({ variable: "--font-gsf", subsets: ["latin"], display: "swap" });
const sansCode = Google_Sans_Code({ variable: "--font-gsc", subsets: ["latin"], display: "swap" });

export const appFontClassName = `${sansFlex.variable} ${sansCode.variable}`;
