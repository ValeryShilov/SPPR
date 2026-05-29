import apiClient from './client'

export interface AlertSettings {
  p1_tsb_threshold:  number
  p2_resting_hr_pct: number
  p3_hrv_pct:        number
  p5_z45_pct:        number
  h1_ctl_delta:      number
  h2_tsb_high:       number
  h3_tss_pct:        number
  h5_z12_pct:        number
}

export const settingsApi = {
  getAlertSettings: (): Promise<AlertSettings> =>
    apiClient.get('/settings/alerts').then((r) => r.data),

  updateAlertSettings: (data: AlertSettings): Promise<AlertSettings> =>
    apiClient.put('/settings/alerts', data).then((r) => r.data),
}
