// 천간·지지의 한글 읽기와 오행 (표시용)

export const STEMS: Record<string, { reading: string; element: string }> = {
  甲: { reading: "갑", element: "목" },
  乙: { reading: "을", element: "목" },
  丙: { reading: "병", element: "화" },
  丁: { reading: "정", element: "화" },
  戊: { reading: "무", element: "토" },
  己: { reading: "기", element: "토" },
  庚: { reading: "경", element: "금" },
  辛: { reading: "신", element: "금" },
  壬: { reading: "임", element: "수" },
  癸: { reading: "계", element: "수" },
};

export const BRANCHES: Record<string, { reading: string; element: string }> = {
  子: { reading: "자", element: "수" },
  丑: { reading: "축", element: "토" },
  寅: { reading: "인", element: "목" },
  卯: { reading: "묘", element: "목" },
  辰: { reading: "진", element: "토" },
  巳: { reading: "사", element: "화" },
  午: { reading: "오", element: "화" },
  未: { reading: "미", element: "토" },
  申: { reading: "신", element: "금" },
  酉: { reading: "유", element: "금" },
  戌: { reading: "술", element: "토" },
  亥: { reading: "해", element: "수" },
};
