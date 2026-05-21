# Парсинг файлов телеметрии

## Поддерживаемые форматы

| Формат | Библиотека | Описание |
|---|---|---|
| FIT | fitparse | Бинарный формат Garmin/ANT+. Основной формат спортивных часов |
| GPX | gpxpy | XML-формат GPS-треков. Поддерживается большинством устройств |
| TCX | lxml | XML-формат Garmin Training Center. Содержит данные пульса и каденса |
| CSV | pandas | Табличный формат. Ручной экспорт из приложений или ручной ввод |

## Извлекаемые метрики

Из каждого файла извлекаются следующие показатели:

| Поле | Тип | Источник в форматах |
|---|---|---|
| actual_duration_min | INT | Из временных меток первой и последней точки |
| distance_km | DECIMAL | Накопленная дистанция из треккинг-точек |
| avg_hr | INT | Среднее арифметическое всех точек пульса |
| max_hr | INT | Максимальное значение пульса за тренировку |
| actual_tss | DECIMAL | Рассчитывается после извлечения avg_hr и duration |

## Логика парсинга по форматам

### FIT (fitparse)
```python
# Ключевые record messages: 'record' содержит точки трека
# Поля: heart_rate, distance, timestamp, speed
# Накопленная дистанция берётся из последней точки поля distance
# Пульс усредняется по всем точкам где heart_rate is not None

from fitparse import FitFile

def parse_fit(file_path: str) -> dict:
    fitfile = FitFile(file_path)
    hr_values = []
    distance = 0
    timestamps = []

    for record in fitfile.get_messages('record'):
        data = {f.name: f.value for f in record}
        if data.get('heart_rate'):
            hr_values.append(data['heart_rate'])
        if data.get('distance'):
            distance = data['distance']
        if data.get('timestamp'):
            timestamps.append(data['timestamp'])

    duration_min = (timestamps[-1] - timestamps[0]).seconds / 60
    return {
        'actual_duration_min': round(duration_min),
        'distance_km': round(distance / 1000, 3),
        'avg_hr': round(sum(hr_values) / len(hr_values)) if hr_values else None,
        'max_hr': max(hr_values) if hr_values else None,
    }
```

### GPX (gpxpy)
```python
# GPX содержит trackpoints с расширениями для пульса
# Пульс в <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>
# Дистанция вычисляется через gpx.length_3d()

import gpxpy

def parse_gpx(file_path: str) -> dict:
    with open(file_path, 'r') as f:
        gpx = gpxpy.parse(f)

    hr_values = []
    for track in gpx.tracks:
        for segment in track.segments:
            for point in segment.points:
                if point.extensions:
                    # Извлечь hr из extensions
                    for ext in point.extensions:
                        hr = ext.find('.//{*}hr')
                        if hr is not None:
                            hr_values.append(int(hr.text))

    duration_sec = gpx.get_duration()
    distance_m = gpx.length_3d()

    return {
        'actual_duration_min': round(duration_sec / 60) if duration_sec else None,
        'distance_km': round(distance_m / 1000, 3) if distance_m else None,
        'avg_hr': round(sum(hr_values) / len(hr_values)) if hr_values else None,
        'max_hr': max(hr_values) if hr_values else None,
    }
```

### TCX (lxml)
```python
# TCX — XML с пространством имён Garmin
# Структура: TrainingCenterDatabase/Activities/Activity/Lap/Track/Trackpoint
# Пульс: Trackpoint/HeartRateBpm/Value
# Дистанция: Lap/DistanceMeters (суммируется по всем Lap)

from lxml import etree

def parse_tcx(file_path: str) -> dict:
    ns = {
        'tcx': 'http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2',
        'ext': 'http://www.garmin.com/xmlschemas/ActivityExtension/v2'
    }
    tree = etree.parse(file_path)
    root = tree.getroot()

    hr_values = []
    total_distance = 0.0
    timestamps = []

    for trackpoint in root.findall('.//tcx:Trackpoint', ns):
        hr = trackpoint.find('.//tcx:Value', ns)
        if hr is not None:
            hr_values.append(int(hr.text))
        time = trackpoint.find('tcx:Time', ns)
        if time is not None:
            timestamps.append(time.text)

    for lap in root.findall('.//tcx:Lap', ns):
        dist = lap.find('tcx:DistanceMeters', ns)
        if dist is not None:
            total_distance += float(dist.text)

    # Длительность из первой и последней метки времени
    from datetime import datetime
    fmt = '%Y-%m-%dT%H:%M:%SZ'
    if len(timestamps) >= 2:
        t_start = datetime.strptime(timestamps[0], fmt)
        t_end = datetime.strptime(timestamps[-1], fmt)
        duration_min = (t_end - t_start).seconds / 60
    else:
        duration_min = None

    return {
        'actual_duration_min': round(duration_min) if duration_min else None,
        'distance_km': round(total_distance / 1000, 3),
        'avg_hr': round(sum(hr_values) / len(hr_values)) if hr_values else None,
        'max_hr': max(hr_values) if hr_values else None,
    }
```

### CSV (pandas)
```python
# CSV не имеет единого стандарта — поддерживаем несколько вариантов
# Ожидаемые колонки (гибкий маппинг):
# Время: time / timestamp / Time
# Пульс: heart_rate / hr / HeartRate / pulse
# Дистанция: distance / Distance / dist
# Если колонок нет — предлагать ручной ввод

import pandas as pd

COLUMN_MAP = {
    'heart_rate': ['heart_rate', 'hr', 'HeartRate', 'pulse', 'Pulse'],
    'distance':   ['distance', 'Distance', 'dist', 'km'],
    'time':       ['time', 'timestamp', 'Time', 'Timestamp', 'elapsed'],
}

def parse_csv(file_path: str) -> dict:
    df = pd.read_csv(file_path)
    df.columns = df.columns.str.strip()

    def find_column(df, variants):
        for v in variants:
            if v in df.columns:
                return v
        return None

    hr_col = find_column(df, COLUMN_MAP['heart_rate'])
    dist_col = find_column(df, COLUMN_MAP['distance'])
    time_col = find_column(df, COLUMN_MAP['time'])

    result = {}

    if hr_col:
        hr_values = df[hr_col].dropna()
        result['avg_hr'] = round(hr_values.mean())
        result['max_hr'] = int(hr_values.max())

    if dist_col:
        result['distance_km'] = round(df[dist_col].max(), 3)

    if time_col:
        try:
            times = pd.to_datetime(df[time_col])
            duration_sec = (times.max() - times.min()).seconds
            result['actual_duration_min'] = round(duration_sec / 60)
        except Exception:
            pass

    return result
```

## Celery-задача парсинга

```python
# backend/tasks/telemetry.py

@celery_app.task(bind=True, max_retries=3)
def parse_telemetry_file(self, workout_id: str,
                         file_path: str, file_format: str):
    try:
        # 1. Парсинг по формату
        parsers = {
            'fit': parse_fit,
            'gpx': parse_gpx,
            'tcx': parse_tcx,
            'csv': parse_csv,
        }
        parser = parsers.get(file_format.lower())
        if not parser:
            raise ValueError(f'Неподдерживаемый формат: {file_format}')

        raw_data = parser(file_path)

        # 2. Получить ЧССПАНО атлета для расчёта TSS
        # (через sync DB-сессию внутри задачи)

        # 3. Рассчитать actual_tss
        # IF = avg_hr / threshold_hr
        # TSS = (duration * IF² * 100) / 60

        # 4. Сохранить в actual_telemetry

        # 5. Вызвать calculate_load_indexes

        # 6. Вызвать generate_alerts

    except Exception as exc:
        # Повторить задачу через 60 секунд при ошибке
        raise self.retry(exc=exc, countdown=60)
```

## Обработка ошибок парсинга

| Ошибка | Поведение |
|---|---|
| Неподдерживаемый формат файла | Вернуть 400, задача не ставится |
| Файл повреждён или пуст | Задача помечается failed, уведомить пользователя |
| Нет данных пульса в файле | Сохранить без avg_hr/max_hr, TSS не рассчитывается |
| Нет данных о дистанции | Сохранить без distance_km |
| Повторная загрузка файла для той же тренировки | Перезаписать actual_telemetry |

## Статусы обработки (для фронтенда)

Фронтенд опрашивает GET /telemetry/status/{task_id} каждые 2 секунды:

| Статус | Описание |
|---|---|
| pending | Задача в очереди, ещё не начата |
| processing | Парсинг выполняется |
| success | Файл обработан, данные сохранены |
| failed | Ошибка при обработке, см. error_message |