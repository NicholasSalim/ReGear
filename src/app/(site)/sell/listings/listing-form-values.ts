import type { ConditionCheckEntry } from "@/lib/condition";

// Kept out of listing-form.tsx: values exported from a "use client" module
// reach server components as client references, not as plain objects.

export type ListingFormValues = {
  title: string;
  category: string;
  brand: string;
  model: string;
  description: string;
  price: string;
  originalPrice: string;
  shipping: string;
  location: string;
  conditionGrade: string;
  warrantyType: string;
  warrantyMonths: string;
  warrantyTerms: string;
  returnWindowDays: string;
  specs: Record<string, string | number | boolean>;
  batteryHealth: string;
  cosmeticScore: string;
  checks: ConditionCheckEntry[];
  includedAccessories: string;
  knownIssues: string;
  serialVerified: boolean;
  originalBox: boolean;
  images: { id: string; url: string }[];
};

export const EMPTY_LISTING: ListingFormValues = {
  title: "",
  category: "phones",
  brand: "",
  model: "",
  description: "",
  price: "",
  originalPrice: "",
  shipping: "0",
  location: "",
  conditionGrade: "EXCELLENT",
  warrantyType: "NONE",
  warrantyMonths: "0",
  warrantyTerms: "",
  returnWindowDays: "7",
  specs: {},
  batteryHealth: "",
  cosmeticScore: "8",
  checks: [],
  includedAccessories: "",
  knownIssues: "",
  serialVerified: false,
  originalBox: false,
  images: [],
};
