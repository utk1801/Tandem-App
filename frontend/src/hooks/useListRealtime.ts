import { useEffect, useRef } from "react";
import { supabase } from "@/src/supabase";

type ItemRow = Record<string, any>;

type Callbacks = {
  onInsert: (row: ItemRow) => void;
  onUpdate: (row: ItemRow) => void;
  onDelete: (row: ItemRow) => void;
};

let _channelSeq = 0;

export function useListRealtime(listId: string | undefined, callbacks: Callbacks) {
  const cbRef = useRef(callbacks);
  cbRef.current = callbacks;

  useEffect(() => {
    if (!listId) return;

    const channelName = `list-items-${listId}-${++_channelSeq}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "items",
          filter: `list_id=eq.${listId}`,
        },
        (payload) => cbRef.current.onInsert(payload.new as ItemRow)
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "items",
          filter: `list_id=eq.${listId}`,
        },
        (payload) => cbRef.current.onUpdate(payload.new as ItemRow)
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "items",
          filter: `list_id=eq.${listId}`,
        },
        (payload) => cbRef.current.onDelete(payload.old as ItemRow)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [listId]);
}
