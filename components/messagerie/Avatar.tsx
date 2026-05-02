import type { Profile } from "@/lib/messagerie/types";
import { avatarColor, initials } from "./format";

export default function Avatar({
  profile,
  size = 36,
  online = false,
}: {
  profile: Profile;
  size?: number;
  online?: boolean;
}) {
  const bg = avatarColor(profile.id);
  return (
    <div className="relative shrink-0">
      {profile.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={profile.avatar_url}
          alt=""
          className="rounded-full object-cover"
          width={size}
          height={size}
          style={{ width: size, height: size }}
        />
      ) : (
        <div
          className="rounded-full flex items-center justify-center text-white font-semibold"
          style={{
            width: size,
            height: size,
            background: bg,
            fontSize: size * 0.42,
          }}
        >
          {initials(profile)}
        </div>
      )}
      {online && (
        <div
          className="absolute bottom-0 right-0 rounded-full bg-emerald-500 border-2 border-white"
          style={{
            width: Math.max(8, size / 4),
            height: Math.max(8, size / 4),
          }}
        />
      )}
    </div>
  );
}
