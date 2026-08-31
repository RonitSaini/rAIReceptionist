import { fieldServiceSmsTemplates } from "./field-service.sms";

/** Customer-facing SMS for plumbing. The wording lives in ./field-service.sms; these are its two nouns. */
export const plumbingSmsTemplates = fieldServiceSmsTemplates({ staff: "plumber", visit: "visit" });
