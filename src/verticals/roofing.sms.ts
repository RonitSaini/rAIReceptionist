import { fieldServiceSmsTemplates } from "./field-service.sms";

/** Customer-facing SMS for roofing. The wording lives in ./field-service.sms; these are its two nouns. */
export const roofingSmsTemplates = fieldServiceSmsTemplates({ staff: "roofer", visit: "estimate" });
