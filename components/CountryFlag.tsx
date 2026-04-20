// Drapeaux SVG vectoriels des pays UEMOA
// + logos officiels (PNG) pour UEMOA et CEDEAO
// Dimensions ratio 3:2 (standard international)

type Props = {
  country: string;
  size?: number;
  showLabel?: boolean;
};

export default function CountryFlag({ country, size = 16, showLabel = false }: Props) {
  const width = size * 1.5; // ratio 3:2
  const height = size;

  const flags: Record<string, React.ReactElement> = {
    CI: (
      <svg width={width} height={height} viewBox="0 0 9 6" xmlns="http://www.w3.org/2000/svg">
        <rect width="3" height="6" x="0" fill="#F77F00" />
        <rect width="3" height="6" x="3" fill="#FFFFFF" />
        <rect width="3" height="6" x="6" fill="#009E60" />
      </svg>
    ),
    SN: (
      <svg width={width} height={height} viewBox="0 0 9 6" xmlns="http://www.w3.org/2000/svg">
        <rect width="3" height="6" x="0" fill="#00853F" />
        <rect width="3" height="6" x="3" fill="#FDEF42" />
        <rect width="3" height="6" x="6" fill="#E31B23" />
        <polygon
          points="4.5,2 4.65,2.5 5.15,2.5 4.75,2.8 4.9,3.3 4.5,3 4.1,3.3 4.25,2.8 3.85,2.5 4.35,2.5"
          fill="#00853F"
        />
      </svg>
    ),
    BF: (
      <svg width={width} height={height} viewBox="0 0 9 6" xmlns="http://www.w3.org/2000/svg">
        <rect width="9" height="3" y="0" fill="#EF2B2D" />
        <rect width="9" height="3" y="3" fill="#009E49" />
        <polygon
          points="4.5,1.8 4.76,2.58 5.58,2.58 4.91,3.07 5.17,3.85 4.5,3.36 3.83,3.85 4.09,3.07 3.42,2.58 4.24,2.58"
          fill="#FCD116"
        />
      </svg>
    ),
    ML: (
      <svg width={width} height={height} viewBox="0 0 9 6" xmlns="http://www.w3.org/2000/svg">
        <rect width="3" height="6" x="0" fill="#14B53A" />
        <rect width="3" height="6" x="3" fill="#FCD116" />
        <rect width="3" height="6" x="6" fill="#CE1126" />
      </svg>
    ),
    BJ: (
      <svg width={width} height={height} viewBox="0 0 9 6" xmlns="http://www.w3.org/2000/svg">
        <rect width="3.6" height="6" x="0" fill="#008751" />
        <rect width="5.4" height="3" x="3.6" y="0" fill="#FCD116" />
        <rect width="5.4" height="3" x="3.6" y="3" fill="#E8112D" />
      </svg>
    ),
    TG: (
      <svg width={width} height={height} viewBox="0 0 9 6" xmlns="http://www.w3.org/2000/svg">
        <rect width="9" height="1.2" y="0" fill="#006A4E" />
        <rect width="9" height="1.2" y="1.2" fill="#FFCE00" />
        <rect width="9" height="1.2" y="2.4" fill="#006A4E" />
        <rect width="9" height="1.2" y="3.6" fill="#FFCE00" />
        <rect width="9" height="1.2" y="4.8" fill="#006A4E" />
        <rect width="3.6" height="3.6" x="0" y="0" fill="#D21034" />
        <polygon
          points="1.8,0.9 2.08,1.75 2.95,1.75 2.24,2.28 2.51,3.13 1.8,2.6 1.09,3.13 1.36,2.28 0.65,1.75 1.52,1.75"
          fill="#FFFFFF"
        />
      </svg>
    ),
    NE: (
      <svg width={width} height={height} viewBox="0 0 9 6" xmlns="http://www.w3.org/2000/svg">
        <rect width="9" height="2" y="0" fill="#E05206" />
        <rect width="9" height="2" y="2" fill="#FFFFFF" />
        <rect width="9" height="2" y="4" fill="#0DB02B" />
        <circle cx="4.5" cy="3" r="0.7" fill="#E05206" />
      </svg>
    ),
    GW: (
      <svg width={width} height={height} viewBox="0 0 9 6" xmlns="http://www.w3.org/2000/svg">
        <rect width="3.6" height="6" x="0" fill="#CE1126" />
        <rect width="5.4" height="3" x="3.6" y="0" fill="#FCD116" />
        <rect width="5.4" height="3" x="3.6" y="3" fill="#009E49" />
        <polygon
          points="1.8,1.8 2.05,2.58 2.87,2.58 2.21,3.07 2.46,3.85 1.8,3.36 1.14,3.85 1.39,3.07 0.73,2.58 1.55,2.58"
          fill="#000000"
        />
      </svg>
    ),
    UEMOA: (
      <img
        src="/flags/uemoa.png"
        alt="UEMOA"
        width={width}
        height={height}
        style={{ objectFit: "contain", display: "block" }}
      />
    ),
    CEDEAO: (
      <img
        src="/flags/cedeao.png"
        alt="CEDEAO"
        width={width}
        height={height}
        style={{ objectFit: "contain", display: "block" }}
      />
    ),
  };

  const flag = flags[country];

  return (
    <span className="inline-flex items-center gap-1.5 align-middle">
      {flag ? (
        <span className="inline-block rounded-sm overflow-hidden border border-slate-200 shadow-sm leading-none">
          {flag}
        </span>
      ) : (
        <span className="inline-block w-[24px] h-[16px] rounded-sm bg-slate-200" />
      )}
      {showLabel && <span className="text-xs">{country}</span>}
    </span>
  );
}