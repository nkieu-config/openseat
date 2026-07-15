import http from "k6/http";
import { check } from "k6";

const gate = __ENV.GATE_URL || "http://localhost:4200";
const eventId = __ENV.EVENT_ID || "loadtest";

export const options = {
  scenarios: {
    onsale_rush: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "10s", target: 200 },
        { duration: "20s", target: 200 },
        { duration: "5s", target: 0 },
      ],
      gracefulRampDown: "5s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500"],
    checks: ["rate>0.99"],
  },
};

export default function () {
  const visitorId = `v:${__VU}-${__ITER}`;
  const res = http.post(
    `${gate}/gate/${eventId}/join`,
    JSON.stringify({ visitorId }),
    { headers: { "Content-Type": "application/json" } },
  );
  check(res, {
    "join returns 200": (r) => r.status === 200,
    "queued or admitted": (r) => {
      try {
        const body = r.json();
        return body.admitted === true || typeof body.position === "number";
      } catch {
        return false;
      }
    },
  });
}
