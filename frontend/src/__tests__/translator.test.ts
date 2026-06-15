import { lookupWord } from "@/lib/translator";

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

function makeFetchResponse(data: unknown, ok = true) {
  return Promise.resolve({
    ok,
    json: () => Promise.resolve(data),
  } as Response);
}

const mymemoryResponse = (translation: string) => ({
  responseData: { translatedText: translation },
});

const dictionaryResponse = (definition: string, example: string, phonetic: string) => [
  {
    phonetic,
    phonetics: [{ text: phonetic }],
    meanings: [
      {
        definitions: [{ definition, example }],
      },
    ],
  },
];

beforeEach(() => {
  mockFetch.mockReset();
});

describe("lookupWord", () => {
  it("returns translation, definition, and phonetic for en-pt", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(dictionaryResponse("to give up", "He abandoned the ship", "/əˈbændən/")),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mymemoryResponse("abandonar")),
      } as Response);

    const result = await lookupWord("abandon", "en-pt");

    expect(result.word).toBe("abandon");
    expect(result.translation).toBe("abandonar");
    expect(result.definition).toBe("to give up");
    expect(result.phonetic).toBe("/əˈbændən/");
    expect(result.example).toBe("He abandoned the ship");
  });

  it("for pt-en makes two calls: translate then definition", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mymemoryResponse("abandon")),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(dictionaryResponse("to leave", "She abandoned it", "/əˈbændən/")),
      } as Response);

    const result = await lookupWord("abandonar", "pt-en");

    expect(result.word).toBe("abandonar");
    expect(result.translation).toBe("abandon");
    expect(result.definition).toBe("to leave");
    expect(mockFetch).toHaveBeenCalledTimes(2);
    // First call should be to mymemory (translation)
    expect(mockFetch.mock.calls[0][0]).toContain("mymemory");
    // Second call should be to dictionary api
    expect(mockFetch.mock.calls[1][0]).toContain("dictionaryapi");
  });

  it("rejects with error on network failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    await expect(lookupWord("hello", "en-pt")).rejects.toThrow();
  });

  it("returns empty definition/phonetic when dictionary API fails", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({}),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mymemoryResponse("olá")),
      } as Response);

    const result = await lookupWord("hello", "en-pt");

    expect(result.translation).toBe("olá");
    expect(result.definition).toBe("");
    expect(result.phonetic).toBe("");
  });
});
