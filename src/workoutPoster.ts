import type { WorkoutRecapModel } from "./workoutRecap";
import { bodySilhouette, front, back } from "./TrainingBodyMap";
export function drawWorkoutPoster(
  canvas: HTMLCanvasElement,
  r: WorkoutRecapModel,
  includeEnergy: boolean,
) {
  canvas.width = 1080;
  canvas.height = 1920;
  const c = canvas.getContext("2d");
  if (!c) throw Error("Image preview is unavailable on this device.");
  c.fillStyle = "#f6f6f6";
  c.fillRect(0, 0, 1080, 1920);
  const text = (
    s: string,
    x: number,
    y: number,
    size: number,
    color = "#111",
    weight = 400,
  ) => {
    c.fillStyle = color;
    c.font = `${weight} ${size}px Arial, sans-serif`;
    c.fillText(s, x, y);
  };
  const fit = (
    s: string,
    x: number,
    y: number,
    size: number,
    width: number,
    color = "#111",
    weight = 400,
  ) => {
    c.font = `${weight} ${size}px Arial, sans-serif`;
    let v = s;
    while (c.measureText(v).width > width && v.length > 1) v = v.slice(0, -1);
    text(v === s ? s : v.slice(0, -1) + "…", x, y, size, color, weight);
  };
  const panel = (x: number, y: number, w: number, h: number) => {
    c.fillStyle = "#fff";
    c.beginPath();
    c.roundRect(x, y, w, h, 24);
    c.fill();
  };
  text("NEOFORM", 64, 100, 32, "#111", 700);
  text(r.date, 800, 100, 25, "#666");
  fit(r.name, 64, 190, 48, 950, "#111", 600);
  text("Workout complete", 64, 240, 27, "#666");
  panel(48, 285, 984, 650);
  [front, back].forEach((shapes, i) => {
    c.save();
    c.translate(150 + i * 455, 320);
    c.scale(1.9, 1.9);
    c.fillStyle = "#e6e6e8";
    c.fill(new Path2D(bodySilhouette));
    Object.entries(shapes).forEach(([name, paths]) =>
      paths?.forEach((d) => {
        c.fillStyle = r.muscles.includes(name as (typeof r.muscles)[number])
          ? "#236bfe"
          : "#f8f8f8";
        const p = new Path2D(d);
        c.fill(p);
        c.strokeStyle = "#e6e6e8";
        c.lineWidth = 1.5;
        c.stroke(p);
      }),
    );
    c.restore();
  });
  fit(r.muscles.join(" · "), 80, 905, 24, 920, "#666");
  text("Personal records", 64, 1000, 34, "#111", 600);
  text(String(r.records.length), 970, 1000, 34, "#111", 600);
  const highlights = r.records.slice(0, 3);
  if (highlights.length)
    highlights.forEach((record, i) => {
      const y = 1030 + i * 125;
      panel(48, y, 984, 110);
      c.fillStyle = "#e6b548";
      c.beginPath();
      c.arc(89, y + 40, 10, 0, Math.PI * 2);
      c.fill();
      fit(record.name, 118, y + 43, 29, 850, "#111", 500);
      fit(record.label, 118, y + 83, 25, 850, "#666");
    });
  else {
    panel(48, 1030, 984, 110);
    text("Training logged. Your progress continues.", 80, 1095, 29, "#666");
  }
  if (r.records.length > 3)
    text(
      `+ ${r.records.length - 3} more records in the recap`,
      64,
      1440,
      24,
      "#666",
    );
  panel(48, 1480, 984, 260);
  const stat = (value: string, label: string, x: number, y: number) => {
    text(value, x, y, 43, "#111", 600);
    text(label, x, y + 38, 22, "#666");
  };
  stat(String(r.minutes ?? "—"), "MINUTES", 80, 1550);
  stat(String(r.work), "WORK BOUTS", 575, 1550);
  stat(
    includeEnergy && r.energy
      ? `~${r.energy.low}–${r.energy.high}`
      : String(r.reps),
    includeEnergy && r.energy ? "KCAL · ROUGH ESTIMATE" : "COMPLETED REPS",
    80,
    1670,
  );
  stat(`+${r.xp} XP`, `LEVEL ${r.level} · ${r.days} TRAINING DAYS`, 575, 1670);
  if (includeEnergy && r.energy) {
    text(
      "Generic MET scenarios · total session energy, including rest",
      64,
      1794,
      22,
      "#666",
    );
    text(
      r.energy.source === "current"
        ? "Uses current profile weight, not a historical measurement."
        : "Uses bodyweight recorded with this workout. Not measured.",
      64,
      1828,
      22,
      "#666",
    );
  }
  text("NEOFORM  /  WORKOUTS", 64, 1880, 23, "#666");
}
