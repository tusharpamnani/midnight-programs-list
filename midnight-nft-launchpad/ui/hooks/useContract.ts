'use client';

import { useState, useCallback, useEffect } from 'react';
import { getDeployment, actionDeploy } from '../app/actions';
import { DeploymentInfo } from '../types/nft';

export function useContract() {
  const [deployment, setDeployment] = useState<DeploymentInfo | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const fetchDeploymentState = useCallback(async () => {
    try {
      const info = await getDeployment();
      if (info) {
        setDeployment({
          contractAddress: info.contractAddress,
          network: 'preprod',
          deployedAt: info.deployedAt || new Date().toISOString()
        });
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    fetchDeploymentState();
    const interval = setInterval(fetchDeploymentState, 5000);
    return () => clearInterval(interval);
  }, [fetchDeploymentState]);

  const addLog = useCallback((msg: string) => {
    setLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 50));
  }, []);

  const deploy = useCallback(async () => {
    addLog("Initiating contract deployment via backend CLI...");
    try {
      const res = await actionDeploy();
      if (res.stdout) addLog(res.stdout);
      await fetchDeploymentState();
      addLog(`Deployment complete! ✨`);
    } catch (e: any) {
      addLog(`Error during deployment: ${e.message}`);
    }
  }, [addLog, fetchDeploymentState]);

  return {
    deployment,
    deploy,
    log,
    addLog,
  };
}
