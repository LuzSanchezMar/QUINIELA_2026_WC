const teamFlagCodes = {
  alemania: "DE",
  "arabia saudita": "SA",
  argelia: "DZ",
  argentina: "AR",
  australia: "AU",
  austria: "AT",
  belgica: "BE",
  belgium: "BE",
  "bosnia y herzegovina": "BA",
  brasil: "BR",
  brazil: "BR",
  "cabo verde": "CV",
  canada: "CA",
  catar: "QA",
  qatar: "QA",
  chequia: "CZ",
  colombia: "CO",
  "corea del sur": "KR",
  "costa de marfil": "CI",
  croacia: "HR",
  curazao: "CW",
  curacao: "CW",
  ecuador: "EC",
  egipto: "EG",
  espana: "ES",
  spain: "ES",
  "estados unidos": "US",
  "usa": "US",
  "united states": "US",
  francia: "FR",
  france: "FR",
  ghana: "GH",
  haiti: "HT",
  irak: "IQ",
  iraq: "IQ",
  iran: "IR",
  japon: "JP",
  japan: "JP",
  jordania: "JO",
  marruecos: "MA",
  morocco: "MA",
  mexico: "MX",
  noruega: "NO",
  norway: "NO",
  "nueva zelanda": "NZ",
  "paises bajos": "NL",
  holanda: "NL",
  netherlands: "NL",
  panama: "PA",
  paraguay: "PY",
  portugal: "PT",
  "rd congo": "CD",
  "republica democratica del congo": "CD",
  "dr congo": "CD",
  senegal: "SN",
  sudafrica: "ZA",
  "south africa": "ZA",
  suecia: "SE",
  sweden: "SE",
  suiza: "CH",
  switzerland: "CH",
  tunez: "TN",
  tunisia: "TN",
  turquia: "TR",
  turkey: "TR",
  uruguay: "UY",
  uzbekistan: "UZ",

  bolivia: "BO",
  chile: "CL",
  china: "CN",
  dinamarca: "DK",
  "el salvador": "SV",
  grecia: "GR",
  honduras: "HN",
  irlanda: "IE",
  italia: "IT",
  jamaica: "JM",
  nigeria: "NG",
  peru: "PE",
  polonia: "PL",
  "republica dominicana": "DO",
  rumania: "RO",
  serbia: "RS",
  ucrania: "UA",
  venezuela: "VE"
};

const regionalFlags = {
  escocia: "\uD83C\uDFF4\uDB40\uDC67\uDB40\uDC62\uDB40\uDC73\uDB40\uDC63\uDB40\uDC74\uDB40\uDC7F",
  scotland: "\uD83C\uDFF4\uDB40\uDC67\uDB40\uDC62\uDB40\uDC73\uDB40\uDC63\uDB40\uDC74\uDB40\uDC7F",
  inglaterra: "\uD83C\uDFF4\uDB40\uDC67\uDB40\uDC62\uDB40\uDC65\uDB40\uDC6E\uDB40\uDC67\uDB40\uDC7F",
  england: "\uD83C\uDFF4\uDB40\uDC67\uDB40\uDC62\uDB40\uDC65\uDB40\uDC6E\uDB40\uDC67\uDB40\uDC7F"
};

export const teamFlags = Object.fromEntries(
  Object.entries(teamFlagCodes).map(([name, code]) => [name, flagFromCountryCode(code)])
);

export function flagForTeam(team) {
  const normalizedTeam = normalizeTeamName(team);
  return regionalFlags[normalizedTeam] || teamFlags[normalizedTeam] || "\uD83C\uDFF3\uFE0F";
}

function flagFromCountryCode(countryCode) {
  return countryCode
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

function normalizeTeamName(team) {
  return String(team || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
