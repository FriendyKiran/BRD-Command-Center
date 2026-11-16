import { describe, expect, it } from "vitest";
import { STRATEGY_INDEX } from "../engine/yards";
import { VET_NEED, vetNeed } from "./vet";

const S = STRATEGY_INDEX;

describe("veterinary review grading", () => {
  it("routes changes in antimicrobial use to the vet, and leaves the SOP's own plan under protocol", () => {
    expect(vetNeed(S["prem-enh"], S["prem-std"])).toBe("protocol");
    expect(vetNeed(S["none-enh"], S["none-std"])).toBe("none");
    expect(vetNeed(S["eco-std"], S["none-std"])).toBe("escalate");
    expect(vetNeed(S["prem-std"], S["eco-std"])).toBe("escalate");
    expect(vetNeed(S["eco-std"], S["prem-std"])).toBe("reduce");
    expect(vetNeed(S["none-enh"], S["prem-std"])).toBe("withdraw");
    expect(VET_NEED.protocol.queue).toBe(false);
    expect(VET_NEED.escalate.queue && VET_NEED.reduce.queue && VET_NEED.withdraw.queue).toBe(true);
  });
});
