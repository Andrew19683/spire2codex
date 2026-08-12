type CharacterPresentation = { initials: string; sigil: string; color: string };

const knownCharacters: Record<string, CharacterPresentation> = {
  ironclad: { initials: "IC", sigil: "◆", color: "#ba4538" },
  silent: { initials: "SL", sigil: "◒", color: "#4b8b62" },
  regent: { initials: "RG", sigil: "✦", color: "#d0a04b" },
  necrobinder: { initials: "NB", sigil: "☽", color: "#7661a8" },
  defect: { initials: "DF", sigil: "◎", color: "#4b82a8" },
};

const colorFor = (id: string) => {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 38% 48%)`;
};

export function characterPresentation(id: string, name: string): CharacterPresentation {
  return knownCharacters[id] ?? {
    initials: name.slice(0, 2).toUpperCase(),
    sigil: "◆",
    color: colorFor(id),
  };
}
