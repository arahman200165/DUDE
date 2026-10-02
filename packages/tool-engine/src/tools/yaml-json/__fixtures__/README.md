# YAML golden corpus

service-deployment.yaml is an authored, compact Kubernetes Deployment-shaped example, not a
copy of a live manifest. It exercises nested mappings, a sequence of containers, and a nested port
sequence. The golden-corpus spec converts it to JSON and checks representative values at each
level.

Dev-time test fixture only; it is not included in the app's asset globs.