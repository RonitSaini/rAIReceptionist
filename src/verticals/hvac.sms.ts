import { fieldServiceSmsTemplates } from "./field-service.sms";

/** Customer-facing SMS for hvac. The wording lives in ./field-service.sms; these are its two nouns. */
export const hvacSmsTemplates = fieldServiceSmsTemplates({ staff: "engineer", visit: "visit" });
