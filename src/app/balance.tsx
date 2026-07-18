import { useEffect, useState } from 'react';
import { View, Text, Pressable, FlatList } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams } from 'expo-router';
import { getMyMembership } from '../features/missions/api';
import { getPointsPool, getOpenMissions, runBalance, assignMission, type PointsPoolEntry, type OpenMission } from '../features/balance/api';

export default function BalanceScreen() {
  const { t } = useTranslation();
  const { houseId } = useLocalSearchParams<{ houseId: string }>();
  const [pool, setPool] = useState<PointsPoolEntry[]>([]);
  const [openMissions, setOpenMissions] = useState<OpenMission[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  async function load() {
    const membership = await getMyMembership(houseId);
    setIsAdmin(membership?.role === 'admin');
    const [poolRows, missions] = await Promise.all([getPointsPool(houseId), getOpenMissions(houseId)]);
    setPool(poolRows);
    setOpenMissions(missions);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [houseId]);

  async function handleRunBalance() {
    setRunning(true);
    try {
      await runBalance(houseId);
      await load();
    } finally {
      setRunning(false);
    }
  }

  async function handleManualAssign(missionId: string, memberId: string) {
    await assignMission(missionId, memberId);
    await load();
  }

  if (loading) {
    return <View style={{ flex: 1 }} />;
  }

  return (
    <View style={{ flex: 1, padding: 24, gap: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: '800' }}>{t('balance.title')}</Text>
      <FlatList
        data={pool}
        keyExtractor={(p) => p.member_id}
        renderItem={({ item }) => {
          const behind = item.points_target + item.debt - item.points_earned;
          return (
            <View testID={`balance-row-${item.member_id}`} style={{ paddingVertical: 8, borderBottomWidth: 1, borderColor: '#eee' }}>
              <Text style={{ fontWeight: '700' }}>{item.name}</Text>
              <Text style={{ fontSize: 12, opacity: 0.7 }}>
                {t('balance.earned')}: {item.points_earned} · {t('balance.target')}: {Math.round(item.points_target)}
                {item.debt > 0 ? ` · ${t('balance.debt')}: ${item.debt}` : ''}
              </Text>
              <Text style={{ fontSize: 12, opacity: 0.7 }}>
                {behind > 0 ? `${t('balance.behindBy')} ${Math.round(behind)}` : t('balance.onTrack')}
              </Text>
            </View>
          );
        }}
      />
      {isAdmin && (
        <Pressable
          onPress={handleRunBalance}
          disabled={running}
          testID="run-balance"
          style={{ backgroundColor: '#26332E', borderRadius: 14, padding: 14, alignItems: 'center' }}
        >
          <Text style={{ color: '#F6F1E4', fontWeight: '700' }}>{t('balance.runBalance')}</Text>
        </Pressable>
      )}
      {isAdmin && openMissions.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={{ fontWeight: '700' }}>{t('balance.openMissions')}</Text>
          {openMissions.map((m) => (
            <View key={m.id} testID={`open-mission-${m.id}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ flex: 1 }}>
                {m.title} · {m.points}
              </Text>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {pool.map((p) => (
                  <Pressable
                    key={p.member_id}
                    onPress={() => handleManualAssign(m.id, p.member_id)}
                    testID={`assign-${m.id}-${p.member_id}`}
                    style={{ borderWidth: 1, borderRadius: 8, padding: 6 }}
                  >
                    <Text style={{ fontSize: 11 }}>{p.name}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
