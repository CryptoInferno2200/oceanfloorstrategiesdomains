import type { UserLoginEvent, UserValidateEvent } from "@netlify/functions";

export default {
  async userValidate(_event: UserValidateEvent) {
    // Authentication is open to confirmed accounts. The whitelist controls
    // complimentary eligibility, not whether a customer may sign in.
  },
  async userLogin(_event: UserLoginEvent) {
    // Returning without event.deny() allows the Identity login to continue.
  },
};
