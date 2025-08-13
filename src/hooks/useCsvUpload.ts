import { useState, useRef } from 'react';
import { CsvUploadStatus, Player } from '../types';
import { positionCategories } from '../data/mockData';

export function useCsvUpload() {
  const [csvUploadStatus, setCsvUploadStatus] = useState<CsvUploadStatus>({ 
    status: 'idle', 
    message: '' 
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessingFile, setIsProcessingFile] = useState(false);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>, setPlayers: (players: Player[]) => void) => {
    // Safety check
    if (isProcessingFile) return;

    // Reset state
    setIsProcessingFile(true);
    setCsvUploadStatus({ status: 'idle', message: '' });
    
    try {
      // Get the file
      const file = event.target?.files?.[0];
      
      if (!file) {
        setCsvUploadStatus({ status: 'error', message: 'No file selected' });
        setIsProcessingFile(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      
      // Check file extension
      if (!file.name.toLowerCase().endsWith('.csv')) {
        setCsvUploadStatus({ status: 'error', message: 'File must be a CSV file (.csv)' });
        setIsProcessingFile(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      
      file.text().then(csvText => {
        try {
          // Parse CSV text
          const lines = csvText.split('\n').filter(line => line.trim());
          
          if (lines.length < 2) {
            setCsvUploadStatus({ status: 'error', message: 'CSV must have header row and data' });
            setIsProcessingFile(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
          }
          
          // Extract header row and normalize
          const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
          
          // Map expected column headers to their standardized names
          const headerMap: Record<string, string> = {
            'rank': 'rank',
            'position': 'position',
            'pos': 'position',
            'player': 'name',
            'player name': 'name',
            'team': 'team',
            'bye': 'bye',
            'bye week': 'bye',
            'auc $': 'projectedValue',
            'auction value': 'projectedValue', 
            'auction $': 'projectedValue',
            'proj. pts': 'projectedPoints',
            'proj pts': 'projectedPoints',
            'projected points': 'projectedPoints'
          };
          
          // Find column indices based on the mapping
          const columnIndices: Record<string, number> = {};
          headers.forEach((header, index) => {
            const normalizedHeader = header.toLowerCase().trim();
            if (headerMap[normalizedHeader]) {
              columnIndices[headerMap[normalizedHeader]] = index;
            }
          });
          
          // Verify required columns exist
          const requiredColumns = ['rank', 'position', 'name', 'team', 'bye', 'projectedValue', 'projectedPoints'];
          const missingColumns = requiredColumns.filter(col => columnIndices[col] === undefined);
          
          if (missingColumns.length > 0) {
            setCsvUploadStatus({ 
              status: 'error', 
              message: `Missing required columns: ${missingColumns.join(', ')}. Expected: RANK, POSITION, PLAYER, TEAM, BYE, AUC $, PROJ. PTS` 
            });
            setIsProcessingFile(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
          }
          
          // Process data rows
          const parsedPlayers: Player[] = [];
          
          for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const values = line.split(',').map(v => v.trim());
            
            // Get values using column indices
            const getValue = (key: string) => {
              const index = columnIndices[key];
              return index !== undefined && index < values.length ? values[index] : '';
            };
            
            // Get position and validate/normalize
            let position = getValue('position').toUpperCase();
            
            // Map common position variants
            if (['D', 'DST', 'D/ST'].includes(position)) position = 'DEF';
            if (['PK'].includes(position)) position = 'K';
            
            // Skip if position is invalid
            if (!Object.keys(positionCategories).includes(position)) {
              continue;
            }
            
            // Parse numeric values
            const rank = parseInt(getValue('rank')) || i;
            const bye = parseInt(getValue('bye')) || 0;
            const projectedValue = parseFloat(getValue('projectedValue')) || 0;
            const projectedPoints = parseFloat(getValue('projectedPoints')) || 0;
            
            // Create player object
            const player: Player = {
              id: i,
              rank: rank,
              position: position,
              name: getValue('name'),
              team: getValue('team'),
              bye: bye,
              projectedValue: projectedValue,
              projectedPoints: projectedPoints
            };
            
            parsedPlayers.push(player);
          }
          
          // Make sure we have players
          if (parsedPlayers.length === 0) {
            setCsvUploadStatus({ status: 'error', message: 'No valid player data found in CSV' });
            setIsProcessingFile(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
          }
          
          // Success! Update the player list
          setPlayers(parsedPlayers);
          setCsvUploadStatus({ 
            status: 'success', 
            message: `Successfully imported ${parsedPlayers.length} players` 
          });
          
        } catch (err) {
          console.error("CSV parsing error:", err);
          setCsvUploadStatus({ status: 'error', message: 'Error parsing CSV file' });
        } finally {
          setIsProcessingFile(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      }).catch(err => {
        console.error("File reading error:", err);
        setCsvUploadStatus({ status: 'error', message: 'Error reading file' });
        setIsProcessingFile(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      });
      
    } catch (err) {
      console.error("Unexpected error:", err);
      setCsvUploadStatus({ status: 'error', message: 'Unexpected error processing file' });
      setIsProcessingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return {
    csvUploadStatus,
    setCsvUploadStatus,
    fileInputRef,
    isProcessingFile,
    handleFileChange
  };
}
