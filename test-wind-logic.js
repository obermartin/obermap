const timesStr = '["2026-07-07","2026-07-08","2026-07-09","2026-07-10","2026-07-11","2026-07-12","2026-07-13","2026-07-14"]';
const speedsStr = '[27,22.9,15.4,11.4,9.7,11.2,11.7,21]';
const directionsStr = '[277,297,304,331,351,341,24,28]';

let times = JSON.parse(timesStr);
let speeds = JSON.parse(speedsStr);
let directions = JSON.parse(directionsStr);

const testDate = "2026-07-08T12:00:00Z";

let timeIndex = 0;
const targetDate = testDate.substring(0, 10);
const foundIdx = times.findIndex(t => t.startsWith(targetDate));
if (foundIdx !== -1) timeIndex = foundIdx;

const speed = Number(speeds[timeIndex] ?? speeds[0] ?? 0);
const rotation = Number(directions[timeIndex] ?? directions[0] ?? 0);
console.log({ targetDate, timeIndex, speed, rotation });
