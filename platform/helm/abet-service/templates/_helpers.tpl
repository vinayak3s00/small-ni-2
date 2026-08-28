{{/*
Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
Abetworks Proprietary and Confidential.
*/}}
{{- define "abet.name" -}}
{{- .Values.name | default .Chart.Name -}}
{{- end -}}

{{- define "abet.labels" -}}
app.kubernetes.io/name: {{ include "abet.name" . }}
app.kubernetes.io/part-of: abetworks
app.kubernetes.io/managed-by: helm
{{- end -}}

{{- define "abet.selectorLabels" -}}
app.kubernetes.io/name: {{ include "abet.name" . }}
{{- end -}}
