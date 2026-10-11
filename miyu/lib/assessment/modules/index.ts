import { mbtiModule } from "./mbti.ts";
import { relationshipModule } from "./relationship.ts";
import { temperamentModule } from "./temperament.ts";

export { mbtiModule, relationshipModule, temperamentModule };

/** 검사 진행 순서 */
export const ASSESSMENT_MODULES = [mbtiModule, temperamentModule, relationshipModule];
