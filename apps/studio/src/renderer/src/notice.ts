/** C-NOTICE: the single fan-content notice, shown by Studio and copied verbatim into the READMEs. */
export const REPO_URL = "https://github.com/antelm-dev/mmx-engine";
export const TAKEDOWN_URL = `${REPO_URL}/issues/new?template=takedown.md`;

export const FAN_NOTICE = {
  en:
    "Mega Man characters and universe © Capcom. This is a free fan project, not affiliated with or endorsed by Capcom. " +
    "It distributes no Capcom asset. Rights holders can request removal by opening a GitHub issue with the takedown template.",
  fr:
    "Personnages et univers Mega Man © Capcom. Ce projet de fans est gratuit, non affilié à Capcom ni approuvé par Capcom. " +
    "Il ne distribue aucun asset Capcom. Les ayants droit peuvent demander un retrait en ouvrant une issue GitHub avec le modèle « takedown ».",
} as const;
