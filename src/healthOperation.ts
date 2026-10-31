export function healthDeadline<T>(
  task: Promise<T>,
  milliseconds: number,
  cancel?: () => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      cancel?.();
      reject(
        Object.assign(new Error("Health Connect took too long to respond."), {
          code: "HEALTH_TIMEOUT",
        }),
      );
    }, milliseconds);
    task.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
