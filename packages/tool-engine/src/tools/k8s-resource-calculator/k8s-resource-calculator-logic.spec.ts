import { calculateResourceRequests } from "./k8s-resource-calculator-logic.js";

const POD_MANIFEST = `
spec:
  containers:
    - name: app
      resources:
        requests:
          cpu: "250m"
          memory: "128Mi"
        limits:
          cpu: "500m"
          memory: "256Mi"
    - name: sidecar
      resources:
        requests:
          cpu: "100m"
          memory: "64Mi"
`;

describe('calculateResourceRequests', () => {
  it('sums requests and limits across multiple containers', () => {
    const result = calculateResourceRequests(POD_MANIFEST);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.totals.requestsCpu).toBeCloseTo(0.35);
    expect(result.totals.requestsMemory).toBeCloseTo((128 + 64) * 2 ** 20);
    expect(result.totals.limitsCpu).toBeCloseTo(0.5);
    expect(result.totals.limitsMemory).toBeCloseTo(256 * 2 ** 20);
    expect(result.totals.containers).toHaveLength(2);
  });

  it('finds containers nested under spec.template.spec for a Deployment', () => {
    const deployment = `spec:\n  template:\n    spec:\n      containers:\n        - name: app\n          resources:\n            requests:\n              cpu: "1"\n`;
    const result = calculateResourceRequests(deployment);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.totals.requestsCpu).toBe(1);
  });

  it('treats a missing resources block as zero', () => {
    const result = calculateResourceRequests('spec:\n  containers:\n    - name: app\n');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.totals.requestsCpu).toBe(0);
      expect(result.totals.containers[0].requestsCpu).toBeUndefined();
    }
  });

  it('rejects a manifest with no containers', () => {
    expect(calculateResourceRequests('spec: {}\n').ok).toBe(false);
  });

  it('rejects empty input', () => {
    expect(calculateResourceRequests('').ok).toBe(false);
  });
});
