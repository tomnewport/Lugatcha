# Lugʻatcha — A Little Dictionary

**[Open the app →](https://tomnewport.github.io/Lugatcha/)**

A progressive web app for learning Uzbek before a trip to Uzbekistan. Works entirely offline once loaded.

### Generating audio

The app speaks every Uzbek word, phrase, and story sentence. Without prebuilt
audio it falls back to the device's speech synthesis; to ship real recordings,
generate them locally (Apple Silicon Mac recommended) and commit the result:

```sh
brew install uv ffmpeg

uv run python scripts/generate_audio.py --dry-run    # list the ~117 strings
uv run python scripts/generate_audio.py --limit 3    # smoke-test the model first
uv run python scripts/generate_audio.py              # generate everything missing
```

Clips are written to `public/audio/<hash>.mp3` plus a `manifest.json`, keyed by
a hash of the spoken text (`src/audio/key.ts` and the script implement the same
algorithm, pinned by `tests/audio-key-fixtures.json`). The app picks up
whatever exists and falls back to speech synthesis for the rest, so partial
runs are safe to commit.

---

## Reference guide to the Uzbek language and culture

*Lugʻatcha* (lug'atcha) means "little dictionary" or "glossary" in Uzbek. This
repository is a reference guide to the **Uzbek language** and the **culture of
Uzbekistan**, written for an English-speaking audience encountering them for the
first time.

It is designed to be read by both people and AI agents. The goal is to give a
future reader enough grounding to:

- Understand how the Uzbek language works and where an English speaker will
  stumble.
- Hold a basic, respectful conversation and read signs, menus, and names.
- Understand the cultural context — history, institutions, daily life, food,
  and etiquette — needed to be *understood* and to be *respectful*.

> **Scope and honesty note.** This is an orientation guide, not a textbook or an
> academic source. It aims to be accurate and to flag where things are
> contested, regional, or simplified. Where a fact matters (a name, a date, a
> spelling), verify it against a primary source before relying on it. Living
> languages and cultures vary by region, generation, and individual.

### How to read this guide

If you have five minutes, read [Quick Start](#quick-start) below. If you have
longer, work through the documents in order.

#### Language

| Document | What it covers |
|---|---|
| [Overview](docs/language/01-overview.md) | What Uzbek is, who speaks it, its family and history |
| [Writing systems](docs/language/02-writing-systems.md) | The Latin, Cyrillic, and Arabic scripts and how to read them |
| [Pronunciation](docs/language/03-pronunciation.md) | Sounds, vowels, stress — and what English ears miss |
| [Grammar](docs/language/04-grammar.md) | Agglutination, cases, vowel harmony, verbs, word order |
| [Vocabulary & loanwords](docs/language/05-vocabulary.md) | Where Uzbek words come from; Persian, Arabic, Russian layers |
| [Challenges for English speakers](docs/language/06-challenges-for-english-speakers.md) | The specific things that trip learners up, ranked |
| [Phrasebook](docs/language/07-phrasebook.md) | Practical phrases with pronunciation |

#### Culture

| Document | What it covers |
|---|---|
| [History](docs/culture/01-history.md) | From the Silk Road to independence and today |
| [Society & institutions](docs/culture/02-society-and-institutions.md) | Government, religion, education, media, money |
| [People](docs/culture/03-people.md) | Historical and contemporary figures worth knowing |
| [Daily life](docs/culture/04-daily-life.md) | Family, work, the mahalla, hospitality, the calendar |
| [Cuisine](docs/culture/05-cuisine.md) | What people eat, how, and the rituals around it |
| [Customs & etiquette](docs/culture/06-customs-and-etiquette.md) | How to behave, greet, dress, gift, and avoid offence |

### Quick start

- **Country:** Republic of Uzbekistan (*Oʻzbekiston Respublikasi*), Central Asia.
  Capital: **Tashkent** (*Toshkent*). Doubly landlocked.
- **Language:** Uzbek (*oʻzbek tili* / *oʻzbekcha*), a **Turkic** language. The
  state language; Russian is widely used as a lingua franca.
- **Script:** Officially **Latin**, but **Cyrillic** is still everywhere in
  practice. You must be able to recognise both. (See
  [Writing systems](docs/language/02-writing-systems.md).)
- **Greeting:** *Assalomu alaykum* (peace be upon you) — universal and polite.
  Reply: *Vaalaykum assalom*.
- **Thank you:** *Rahmat.* **Please/excuse me:** *Iltimos* / *Kechirasiz.*
- **The two cultural pillars to remember:** **hospitality** (*mehmondoʻstlik*)
  and the **mahalla** (the neighbourhood community). A guest is honoured; the
  community is the unit of social life.
- **Food you will meet first:** **osh / plov** (the national rice dish), **non**
  (bread — never put it upside down, never waste it), and **choy** (tea, served
  constantly).
- **Biggest language surprise:** Uzbek is **agglutinative** — it builds long
  words by stacking suffixes, has **no grammatical gender**, no articles, and
  puts the **verb at the end** of the sentence.

### A note on spelling in this guide

Uzbek Latin uses a few characters that look unusual in English:

- **Oʻ / oʻ** — written with a "turned comma" (ʻ), not an apostrophe. A distinct
  vowel, roughly the vowel in British "more" shortened.
- **Gʻ / gʻ** — a guttural "gh".
- **ʼ** — a separate mark (*tutuq belgisi*) marking a glottal stop or a long
  vowel.

You will see these rendered inconsistently online (as `o'`, `o`, `ў`, etc.).
This guide uses the proper turned-comma forms where it can and notes the
alternatives. See [Writing systems](docs/language/02-writing-systems.md) for the
full story.
