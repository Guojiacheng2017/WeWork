export function singleFlight(operation) {
  let active;
  return (...args) => {
    if (!active) active = Promise.resolve().then(() => operation(...args)).finally(() => { active = undefined; });
    return active;
  };
}
