import { useEffect, useState } from "react";
import { request, openProfile } from "./store";
import { Button, Field } from "./ui";
type Profile = { id: string; name: string; locked: boolean };
export function ProfileGate() {
  const [profiles, setProfiles] = useState<Profile[]>([]),
    [selected, setSelected] = useState<Profile | null>(null),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void request<{ profiles: Profile[] }>("/profiles", "GET", undefined, {
      signal: controller.signal,
    })
      .then((r) => setProfiles(r.profiles))
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, []);
  async function open(profile: Profile, pass?: string) {
    setBusy(true);
    setError("");
    try {
      await openProfile(profile.id, pass);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setPassword("");
    }
  }
  return (
    <main className="profile-gate">
      <p className="eyebrow">NEOFORM</p>
      <h1>{selected ? `Unlock ${selected.name}` : "Who’s training?"}</h1>
      <p>Your programs, workouts and progress stay with your profile.</p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {selected ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void open(selected, password);
          }}
        >
          <Field label="Profile password">
            <input
              type="password"
              autoComplete="current-password"
              autoFocus
              required
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Button variant="primary wide" type="submit" disabled={busy}>
            {busy ? "Opening…" : "Unlock profile"}
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              setSelected(null);
              setPassword("");
              setError("");
            }}
          >
            Choose another profile
          </Button>
        </form>
      ) : (
        <div className="profile-choices">
          {profiles.map((profile) => (
            <button
              key={profile.id}
              disabled={busy}
              onClick={() => {
                if (profile.locked) {
                  setSelected(profile);
                  setError("");
                } else void open(profile);
              }}
            >
              {profile.name}
              <small>{profile.locked ? "Locked" : "Open profile"}</small>
            </button>
          ))}
        </div>
      )}
    </main>
  );
}
