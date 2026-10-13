import re

MOODS = {
    "energize": "Energize",
    "chill": "Chill",
    "focus": "Focus",
    "sad": "Sad",
    "party": "Party",
    "sleep": "Sleep",
    "workout": "Workout",
    "romance": "Romance",
    "ru_pop": "Russian pop",
    "ru_rock": "Russian rock",
    "ru_hiphop": "Russian hip-hop",
}

RU_MOOD_QUERIES = {
    "energize": "бодрая русская музыка",
    "chill": "спокойная русская музыка",
    "focus": "музыка для работы и учёбы",
    "sad": "грустные русские песни",
    "party": "русские хиты для вечеринки",
    "sleep": "музыка для сна",
    "workout": "музыка для тренировок",
    "romance": "русские песни о любви",
}

GENRE_QUERIES = {
    "ru_pop": "русская поп музыка хиты",
    "ru_rock": "русский рок хиты",
    "ru_hiphop": "русский хип-хоп хиты",
}

OTHER_SCENES = re.compile(
    r"bollywood|hindi|punjabi|tamil|telugu|desi|bhakti|devotional|malayalam|kannada|marathi|bengali|bhojpuri|haryanvi"
    r"|k-?pop|j-?pop|mandopop|cantopop|c-?pop|thai|viet|indones|opm|pinoy"
    r"|latin|reggaet|mexican|corridos|banda|sertanejo|brasil|samba|pagode|forr|cumbia|bachata|salsa|urbano"
    r"|arab|khaleeji|t[uü]rk|afro|amapiano|naija|country|christian|gospel|worship|kids|children|schlager",
    re.IGNORECASE,
)
