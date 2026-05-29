export interface TemplateCounts {
  total_workouts: number
  draft_count: number
  published_count: number
}

export interface TemplateStatus {
  label: string
  color: string
  hint: string
}

export function templateStatus(t: TemplateCounts): TemplateStatus {
  if (t.total_workouts === 0)
    return { label: 'Не адаптирован', color: 'gray', hint: 'Откройте редактор и запустите расчёт' }
  if (t.draft_count > 0 && t.published_count === 0)
    return { label: `Черновик (${t.draft_count})`, color: 'orange', hint: 'Откройте матрицу и утвердите тренировки' }
  if (t.draft_count > 0)
    return { label: `Частично (${t.published_count}/${t.total_workouts})`, color: 'yellow', hint: 'Часть тренировок ещё в черновике' }
  return { label: `Утверждён (${t.published_count})`, color: 'green', hint: 'Все тренировки опубликованы' }
}
