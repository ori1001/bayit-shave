import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams } from 'expo-router';
import {
  getMonthMissions,
  getHouseMembers,
  getMyMembership,
  editMissionSchedule,
  type Mission,
} from '../features/missions/api';

const CATEGORY_COLORS: Record<string, string> = {
  dishes: '#1F9E93',
  clean: '#8B5FBF',
  laundry: '#5B72C9',
  trash: '#E0793A',
  shop: '#D45A82',
  pets: '#D99A2B',
  garden: '#7AA23E',
  bath: '#3FAFC9',
  other: '#888888',
};

export default function CalendarScreen() {
  const { t } = useTranslation();
  const { houseId } = useLocalSearchParams<{ houseId: string }>();

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [members, setMembers] = useState<{ id: string; name: string; role: 'admin' | 'member' }[]>([]);
  const [myMemberId, setMyMemberId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [editingMissionId, setEditingMissionId] = useState<string | null>(null);
  const [newDateValue, setNewDateValue] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    const membership = await getMyMembership(houseId);
    setMyMemberId(membership?.id ?? null);
    setIsAdmin(membership?.role === 'admin');
    const [monthMissions, houseMembers] = await Promise.all([
      getMonthMissions(houseId, year, month),
      getHouseMembers(houseId),
    ]);
    setMissions(monthMissions);
    setMembers(houseMembers);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [houseId, year, month]);

  const visibleMissions = useMemo(
    () => (mineOnly ? missions.filter((m) => m.assigned_to === myMemberId) : missions),
    [missions, mineOnly, myMemberId]
  );

  const missionsByDay = useMemo(() => {
    const map = new Map<number, Mission[]>();
    for (const mission of visibleMissions) {
      const day = Number(mission.due_date.slice(8, 10));
      const existing = map.get(day) ?? [];
      existing.push(mission);
      map.set(day, existing);
    }
    return map;
  }, [visibleMissions]);

  const daysInMonth = new Date(year, month, 0).getDate();
  const dayNumbers = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  function handlePrevMonth() {
    if (month === 1) {
      setYear(year - 1);
      setMonth(12);
    } else {
      setMonth(month - 1);
    }
    setSelectedDay(null);
  }

  function handleNextMonth() {
    if (month === 12) {
      setYear(year + 1);
      setMonth(1);
    } else {
      setMonth(month + 1);
    }
    setSelectedDay(null);
  }

  function startEditDate(mission: Mission) {
    setEditingMissionId(mission.id);
    setNewDateValue(mission.due_date);
  }

  async function handleSaveDate(missionId: string) {
    await editMissionSchedule(missionId, newDateValue);
    setEditingMissionId(null);
    await load();
  }

  if (loading) {
    return <View style={{ flex: 1 }} />;
  }

  const selectedMissions = selectedDay !== null ? (missionsByDay.get(selectedDay) ?? []) : [];

  return (
    <View style={{ flex: 1, padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: '800' }}>{t('calendar.title')}</Text>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Pressable onPress={handlePrevMonth} testID="calendar-prev-month">
          <Text style={{ fontSize: 18 }}>‹</Text>
        </Pressable>
        <Text style={{ fontWeight: '700' }}>
          {year}-{String(month).padStart(2, '0')}
        </Text>
        <Pressable onPress={handleNextMonth} testID="calendar-next-month">
          <Text style={{ fontSize: 18 }}>›</Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          onPress={() => setMineOnly(false)}
          testID="calendar-everyone"
          style={{ flex: 1, padding: 8, borderRadius: 10, alignItems: 'center', backgroundColor: !mineOnly ? '#26332E' : 'transparent', borderWidth: 1.5, borderColor: '#26332E' }}
        >
          <Text style={{ color: !mineOnly ? '#F6F1E4' : '#26332E' }}>{t('calendar.everyone')}</Text>
        </Pressable>
        <Pressable
          onPress={() => setMineOnly(true)}
          testID="calendar-mine"
          style={{ flex: 1, padding: 8, borderRadius: 10, alignItems: 'center', backgroundColor: mineOnly ? '#26332E' : 'transparent', borderWidth: 1.5, borderColor: '#26332E' }}
        >
          <Text style={{ color: mineOnly ? '#F6F1E4' : '#26332E' }}>{t('calendar.mine')}</Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
        {dayNumbers.map((day) => {
          const dayMissions = missionsByDay.get(day) ?? [];
          return (
            <Pressable
              key={day}
              onPress={() => setSelectedDay(day)}
              testID={`calendar-day-${day}`}
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                borderWidth: selectedDay === day ? 2 : 1,
                borderColor: selectedDay === day ? '#26332E' : '#ccc',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
              }}
            >
              <Text style={{ fontSize: 11 }}>{day}</Text>
              <View style={{ flexDirection: 'row', gap: 2 }}>
                {dayMissions.slice(0, 3).map((m, i) => (
                  <View
                    key={i}
                    style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: CATEGORY_COLORS[m.category] ?? '#888' }}
                  />
                ))}
              </View>
            </Pressable>
          );
        })}
      </View>

      {selectedDay !== null && (
        <ScrollView style={{ flex: 1, borderTopWidth: 1, borderColor: '#eee', paddingTop: 12 }}>
          {selectedMissions.length === 0 && <Text style={{ opacity: 0.6 }}>{t('calendar.noMissionsThisDay')}</Text>}
          {selectedMissions.map((mission) => {
            const canEdit = isAdmin || mission.assigned_to === myMemberId;
            const assigneeName = members.find((m) => m.id === mission.assigned_to)?.name ?? '';
            return (
              <View key={mission.id} testID={`calendar-mission-${mission.id}`} style={{ gap: 4, paddingVertical: 8, borderBottomWidth: 1, borderColor: '#f0f0f0' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: CATEGORY_COLORS[mission.category] ?? '#888' }} />
                  <Text style={{ fontWeight: '700', flex: 1 }}>{mission.title}</Text>
                  <Text style={{ fontSize: 12, opacity: 0.6 }}>{mission.points}</Text>
                </View>
                <Text style={{ fontSize: 12, opacity: 0.6 }}>{assigneeName}</Text>
                {canEdit ? (
                  <Pressable onPress={() => startEditDate(mission)} testID={`calendar-edit-${mission.id}`}>
                    <Text style={{ fontSize: 12, color: '#4C7A8C' }}>
                      {isAdmin ? t('calendar.editDate') : t('calendar.suggestNewDate')}
                    </Text>
                  </Pressable>
                ) : (
                  <Text style={{ fontSize: 11, opacity: 0.4 }}>{t('calendar.viewOnly')}</Text>
                )}
                {editingMissionId === mission.id && (
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <TextInput
                      value={newDateValue}
                      onChangeText={setNewDateValue}
                      testID={`calendar-date-input-${mission.id}`}
                      style={{ borderWidth: 1, borderRadius: 8, padding: 6, width: 120 }}
                    />
                    <Pressable onPress={() => handleSaveDate(mission.id)} testID={`calendar-date-save-${mission.id}`}>
                      <Text style={{ color: '#7C9473', fontWeight: '700' }}>{t('calendar.save')}</Text>
                    </Pressable>
                    <Pressable onPress={() => setEditingMissionId(null)} testID={`calendar-date-cancel-${mission.id}`}>
                      <Text style={{ color: '#A6425A', fontWeight: '700' }}>{t('calendar.cancel')}</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}
