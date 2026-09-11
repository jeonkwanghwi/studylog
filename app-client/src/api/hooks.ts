import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./client";
import type {
  ChallengeOut, ChallengeProductOut, DailyRecordOut,
  FeedItemOut, GroupOut, SessionOut, UserOut,
} from "./types";

export const keys = {
  me: ["me"] as const,
  session: ["session", "current"] as const,
  challenge: ["challenge", "current"] as const,
  products: ["challenge", "products"] as const,
  groups: ["groups"] as const,
  feed: (groupId: string) => ["feed", groupId] as const,
  records: ["records"] as const,
};

export const useMe = () =>
  useQuery({ queryKey: keys.me, queryFn: () => api.get<UserOut>("/users/me") });

export const useCurrentSession = () =>
  useQuery({
    queryKey: keys.session,
    queryFn: () => api.get<SessionOut | null>("/sessions/current"),
    // 세션이 열려 있으면 서버가 회수했는지 주기적으로 확인해야 한다
    refetchInterval: 60_000,
  });

export const useCurrentChallenge = () =>
  useQuery({
    queryKey: keys.challenge,
    queryFn: () => api.get<ChallengeOut | null>("/challenges/current"),
  });

export const useProducts = () =>
  useQuery({
    queryKey: keys.products,
    queryFn: () => api.get<ChallengeProductOut[]>("/challenges/products"),
  });

export const useGroups = () =>
  useQuery({ queryKey: keys.groups, queryFn: () => api.get<GroupOut[]>("/groups") });

export const useFeed = (groupId: string | undefined) =>
  useQuery({
    queryKey: keys.feed(groupId ?? ""),
    queryFn: () => api.get<FeedItemOut[]>(`/groups/${groupId}/feed`),
    enabled: Boolean(groupId),
  });

export const useRecords = () =>
  useQuery({
    queryKey: keys.records,
    queryFn: () => api.get<DailyRecordOut[]>("/records/me?limit=30"),
  });

/** 세션·유저·챌린지는 함께 움직인다. 하나가 바뀌면 셋 다 다시 읽는다. */
export function useInvalidateAll() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.me }),
      queryClient.invalidateQueries({ queryKey: keys.session }),
      queryClient.invalidateQueries({ queryKey: keys.challenge }),
      queryClient.invalidateQueries({ queryKey: keys.records }),
    ]);
}

export function useSetGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (minutes: number) =>
      api.patch<UserOut>("/users/me/goal", { minutes }),
    onSuccess: (user) => queryClient.setQueryData(keys.me, user),
  });
}
