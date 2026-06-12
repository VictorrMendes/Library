export type Direction = "en-pt" | "pt-en";

export interface TranslationResult {
  word: string;
  translation: string;
  definition: string;
  example: string;
  phonetic: string;
}

async function fetchTranslation(text: string, langpair: string): Promise<string> {
  const res = await fetch(
    `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langpair}`
  );
  if (!res.ok) throw new Error("translation_failed");
  const data = await res.json();
  const translated: string = data.responseData?.translatedText ?? "";
  if (!translated) throw new Error("no_translation");
  return translated;
}

async function fetchDefinition(
  word: string
): Promise<{ definition: string; example: string; phonetic: string }> {
  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.toLowerCase())}`
    );
    if (!res.ok) return { definition: "", example: "", phonetic: "" };
    const data = await res.json();
    const entry = data[0];
    const meaning = entry?.meanings?.[0];
    const def = meaning?.definitions?.[0];
    return {
      definition: def?.definition ?? "",
      example: def?.example ?? "",
      phonetic:
        entry?.phonetic ??
        entry?.phonetics?.find((p: { text?: string }) => p.text)?.text ??
        "",
    };
  } catch {
    return { definition: "", example: "", phonetic: "" };
  }
}

export async function lookupWord(
  word: string,
  direction: Direction
): Promise<TranslationResult> {
  const trimmed = word.trim();

  if (direction === "en-pt") {
    const [defData, translation] = await Promise.all([
      fetchDefinition(trimmed),
      fetchTranslation(trimmed, "en|pt"),
    ]);
    return { word: trimmed, translation, ...defData };
  }

  // PT→EN: translate first to get the English word, then fetch its definition
  const englishWord = await fetchTranslation(trimmed, "pt|en");
  const defData = await fetchDefinition(englishWord);
  return { word: trimmed, translation: englishWord, ...defData };
}
