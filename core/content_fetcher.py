import wikipediaapi

MIN_SECTION_LENGTH = 200  # characters — discard navboxes, stubs, references


def fetch_wikipedia_sections(slug: str) -> list[dict]:
    """
    Fetch a Wikipedia article by its slug and return a list of sections.
    Each section is a dict: {"title": str, "text": str}
    Sections shorter than MIN_SECTION_LENGTH characters are discarded.
    """
    wiki = wikipediaapi.Wikipedia(
        language="en",
        user_agent="Mnemo-App/1.0 (educational spaced repetition tool)",
    )
    page = wiki.page(slug)
    if not page.exists():
        raise ValueError(f"Wikipedia page not found: {slug}")

    sections = []

    # Include the summary/intro as the first section
    if page.summary and len(page.summary) >= MIN_SECTION_LENGTH:
        sections.append({"title": "Introduction", "text": page.summary})

    def _extract(section_list, depth=0):
        for section in section_list:
            text = section.text.strip()
            if text and len(text) >= MIN_SECTION_LENGTH:
                sections.append({"title": section.title, "text": text})
            _extract(section.sections, depth + 1)

    _extract(page.sections)
    return sections
