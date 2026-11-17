import { useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { FileUp } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { errorMessage } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import { supabase } from '@/lib/supabase';
import { parseLetterboxd, type ParsedExport } from '@/supabase/functions/_shared/letterboxd';
import { palette } from '@/theme';

interface ImportResult {
  kind: string;
  imported: number;
  duplicates?: number;
  skipped: number;
  unmatched: string[];
}

/** Letterboxd CSV import: pick a CSV from the export zip, preview, and import via the edge function. */
export default function ImportScreen() {
  const qc = useQueryClient();
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [preview, setPreview] = useState<ParsedExport | null>(null);
  const [asWatchlist, setAsWatchlist] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const pickFile = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel', '*/*'], copyToCacheDirectory: true });
    if (res.canceled) return;
    const asset = res.assets[0];
    try {
      const text = await (await fetch(asset.uri)).text();
      const watchlist = asset.name.toLowerCase().includes('watchlist');
      setAsWatchlist(watchlist);
      setFile({ name: asset.name, text });
      setPreview(parseLetterboxd(text, watchlist ? 'watchlist' : undefined));
      setResult(null);
    } catch (e) {
      setPreview(null);
      toast(errorMessage(e), 'error');
    }
  };

  const runImport = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('import-letterboxd', {
        body: { csv: file.text, hint: asWatchlist ? 'watchlist' : undefined },
      });
      if (error) {
        const detail = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null;
        throw new Error(detail?.error ?? error.message);
      }
      setResult(data as ImportResult);
      qc.invalidateQueries({ queryKey: ['diary'] });
      qc.invalidateQueries({ queryKey: ['watchlist'] });
      qc.invalidateQueries({ queryKey: ['profileCounts'] });
      toast('Import finished', 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView className="flex-1 bg-bg dark:bg-bg-dark" contentContainerClassName="gap-4 p-4 pb-16">
      <Text variant="title">Bring your Letterboxd history</Text>
      <Text className="leading-6">
        1. On letterboxd.com go to Settings → Import & Export → Export your data.{'\n'}
        2. Unzip it and pick <Text className="font-semibold">diary.csv</Text> (or reviews.csv, ratings.csv, watched.csv, watchlist.csv).{'\n'}
        3. Import. Films are matched to TMDB by title and year; re-importing the same file won’t create duplicates.
      </Text>
      <Button title={file ? 'Choose a different file' : 'Choose CSV file'} variant="secondary" icon={<FileUp size={18} color={palette.accent} />} onPress={pickFile} />

      {preview && file ? (
        <View className="gap-3 rounded-2xl bg-surface p-4 dark:bg-surface-dark">
          <Text className="font-semibold">{file.name}</Text>
          <Text variant="caption">
            Detected <Text className="font-semibold">{preview.kind}</Text> export · {preview.rows.length} rows
            {preview.skipped ? ` · ${preview.skipped} blank rows skipped` : ''}
          </Text>
          {preview.kind === 'watched' || preview.kind === 'watchlist' ? (
            <View className="flex-row gap-2">
              <Chip label="Import as watched" selected={!asWatchlist} onPress={() => setAsWatchlist(false)} />
              <Chip label="Import as watchlist" selected={asWatchlist} onPress={() => setAsWatchlist(true)} />
            </View>
          ) : null}
          {preview.rows.slice(0, 5).map((r, i) => (
            <Text key={i} variant="caption" numberOfLines={1}>
              • {r.title} {r.year ? `(${r.year})` : ''} {r.rating ? `· ${r.rating}★` : ''} {r.watchedOn ? `· ${r.watchedOn}` : ''}
            </Text>
          ))}
          <Button title={`Import ${preview.rows.length} rows`} onPress={runImport} loading={busy} disabled={!preview.rows.length} />
          {busy ? <Text variant="caption">Matching films on TMDB — large exports take a minute…</Text> : null}
        </View>
      ) : null}

      {result ? (
        <View className="gap-2 rounded-2xl border border-success p-4">
          <Text variant="heading">Imported {result.imported} {result.kind === 'watchlist' ? 'watchlist films' : 'diary entries'}</Text>
          {result.duplicates ? <Text variant="caption">{result.duplicates} already in your diary (skipped)</Text> : null}
          {result.unmatched.length ? (
            <>
              <Text variant="caption">Couldn’t match {result.unmatched.length} titles:</Text>
              {result.unmatched.slice(0, 15).map((t) => (
                <Text key={t} variant="caption" className="text-xs">
                  • {t}
                </Text>
              ))}
            </>
          ) : (
            <Text variant="caption">Every title was matched.</Text>
          )}
        </View>
      ) : null}
    </ScrollView>
  );
}
