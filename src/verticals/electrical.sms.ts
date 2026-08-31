import { fieldServiceSmsTemplates } from "./field-service.sms";

/** Customer-facing SMS for electrical. The wording lives in ./field-service.sms; these are its two nouns. */
export const electricalSmsTemplates = fieldServiceSmsTemplates({ staff: "electrician", visit: "visit" });
