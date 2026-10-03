import { formatIndianNumber, parseIndianNumber } from "../src/lib/format.ts";
import { amountToWords, integerToIndianWords } from "../src/lib/amount-to-words.ts";

function assertEqual(actual, expected, testName) {
  if (actual !== expected) {
    console.error(`❌ FAILED: ${testName}`);
    console.error(`   Expected: "${expected}"`);
    console.error(`   Actual:   "${actual}"`);
    process.exit(1);
  } else {
    console.log(`✓ Passed: ${testName} -> "${actual}"`);
  }
}

console.log("=== Testing formatIndianNumber ===");
assertEqual(formatIndianNumber(1000), "1,000", "1000 formatting");
assertEqual(formatIndianNumber(10000), "10,000", "10000 formatting");
assertEqual(formatIndianNumber(100000), "1,00,000", "100000 (1 Lakh) formatting");
assertEqual(formatIndianNumber(1000000), "10,00,000", "1000000 (10 Lakh) formatting");
assertEqual(formatIndianNumber(10000000), "1,00,00,000", "10000000 (1 Crore) formatting");
assertEqual(formatIndianNumber(100000000), "10,00,00,000", "100000000 (10 Crore) formatting");
assertEqual(formatIndianNumber(1000000000), "1,00,00,00,000", "1000000000 (100 Crore) formatting");
assertEqual(formatIndianNumber("5000000"), "50,00,000", "String 5000000");
assertEqual(formatIndianNumber("1000000.50", true), "10,00,000.50", "Decimal support");

console.log("\n=== Testing parseIndianNumber ===");
assertEqual(parseIndianNumber("1,000"), 1000, "Parse 1,000");
assertEqual(parseIndianNumber("1,00,000"), 100000, "Parse 1,00,000");
assertEqual(parseIndianNumber("1,00,00,000"), 10000000, "Parse 1,00,00,000");
assertEqual(parseIndianNumber("10,00,000.50"), 1000000.5, "Parse 10,00,000.50");
assertEqual(parseIndianNumber(""), 0, "Parse empty");
assertEqual(parseIndianNumber(0), 0, "Parse 0");

console.log("\n=== Testing amountToWords ===");
assertEqual(amountToWords(0, "INR"), "Rupees Zero Only", "Zero INR");
assertEqual(amountToWords(1000, "INR"), "Rupees One Thousand Only", "1,000 INR");
assertEqual(amountToWords(100000, "INR"), "Rupees One Lakh Only", "1,00,000 INR");
assertEqual(amountToWords(1000000, "INR"), "Rupees Ten Lakh Only", "10,00,000 INR");
assertEqual(amountToWords(10000000, "INR"), "Rupees One Crore Only", "1,00,00,000 INR");
assertEqual(amountToWords(12500000, "INR"), "Rupees One Crore Twenty Five Lakh Only", "1.25 Crore INR");
assertEqual(amountToWords(1000000.5, "INR"), "Rupees Ten Lakh and Fifty Paise Only", "Decimal 10 Lakh 50 Paise");
assertEqual(amountToWords(0.75, "INR"), "Seventy Five Paise Only", "75 Paise Only");
assertEqual(amountToWords(1500, "USD"), "US Dollars One Thousand Five Hundred Only", "USD currency");

console.log("\n🎉 ALL MONEY & AMOUNT-IN-WORDS TESTS PASSED!");
