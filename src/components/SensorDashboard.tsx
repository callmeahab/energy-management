import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Grid,
  Box,
  Chip,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  CircularProgress,
} from '@mui/material';
import {
  Sensors as SensorsIcon,
  ElectricBolt as ElectricIcon,
  Thermostat as ThermostatIcon,
  MoreHoriz as MoreIcon,
} from '@mui/icons-material';
import {
  fetchLocalSensorPoints,
  fetchLocalEnergyConsumption,
  fetchLocalBuildings,
  LocalSensorPoint,
  LocalSensorSummary,
  LocalEnergyConsumption,
  LocalConsumptionSummary,
  LocalBuildingData,
} from '../lib/queries-local';

interface SensorDashboardProps {
  buildingId?: string;
}

export default function SensorDashboard({ buildingId }: SensorDashboardProps) {
  const [sensors, setSensors] = useState<LocalSensorPoint[]>([]);
  const [sensorSummary, setSensorSummary] = useState<LocalSensorSummary | null>(null);
  const [consumption, setConsumption] = useState<LocalEnergyConsumption[]>([]);
  const [consumptionSummary, setConsumptionSummary] = useState<LocalConsumptionSummary | null>(null);
  const [buildings, setBuildings] = useState<LocalBuildingData[]>([]);
  const [selectedBuilding, setSelectedBuilding] = useState<string>(buildingId || 'all');
  const [unitFilter, setUnitFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load data
  useEffect(() => {
    loadData();
    loadBuildings();
  }, [selectedBuilding, unitFilter]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load sensor data
      const sensorData = await fetchLocalSensorPoints(
        selectedBuilding === 'all' ? undefined : selectedBuilding,
        unitFilter === 'all' ? undefined : unitFilter
      );

      if (sensorData) {
        setSensors(sensorData.sensors);
        setSensorSummary(sensorData.summary);
      }

      // Load energy consumption data
      const consumptionData = await fetchLocalEnergyConsumption(
        selectedBuilding === 'all' ? undefined : selectedBuilding
      );

      if (consumptionData) {
        setConsumption(consumptionData.consumption);
        setConsumptionSummary(consumptionData.summary);
      }

    } catch (err) {
      setError('Failed to load sensor data');
      console.error('Error loading sensor data:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadBuildings = async () => {
    try {
      const buildingsData = await fetchLocalBuildings(false);
      if (buildingsData) {
        setBuildings(buildingsData);
      }
    } catch (err) {
      console.error('Error loading buildings:', err);
    }
  };

  const formatValue = (value: any, unitName: string | null | undefined): string => {
    if (value === null || value === undefined) return 'N/A';
    
    if (typeof value === 'boolean') {
      return value ? 'On' : 'Off';
    }
    
    if (typeof value === 'number') {
      if (!unitName) {
        return value.toFixed(2);
      }
      if (unitName === 'Watt') {
        return `${value.toFixed(1)} W`;
      } else if (unitName.includes('Celsius')) {
        return `${value.toFixed(1)}°C`;
      } else if (unitName.includes('Fahrenheit')) {
        return `${value.toFixed(1)}°F`;
      } else {
        return `${value.toFixed(2)} ${unitName}`;
      }
    }
    
    return String(value);
  };

  const getUnitIcon = (unitName: string | null | undefined) => {
    if (!unitName) return <MoreIcon />;
    if (unitName === 'Watt') return <ElectricIcon />;
    if (unitName.includes('Celsius') || unitName.includes('Fahrenheit')) return <ThermostatIcon />;
    return <MoreIcon />;
  };

  const getUnitColor = (unitName: string | null | undefined) => {
    if (!unitName) return 'default';
    if (unitName === 'Watt') return 'error';
    if (unitName.includes('Celsius') || unitName.includes('Fahrenheit')) return 'info';
    return 'default';
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
        <CircularProgress />
        <Typography variant="body1" sx={{ ml: 2 }}>
          Loading sensor data...
        </Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box textAlign="center" py={4}>
        <Typography variant="h6" color="error">
          {error}
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {/* Filters */}
      <Box mb={3}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <FormControl fullWidth>
              <InputLabel>Building</InputLabel>
              <Select
                value={selectedBuilding}
                label="Building"
                onChange={(e) => setSelectedBuilding(e.target.value)}
              >
                <MenuItem value="all">All Buildings</MenuItem>
                {buildings.map((building) => (
                  <MenuItem key={building.id} value={building.id}>
                    {building.name || building.id}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={6}>
            <FormControl fullWidth>
              <InputLabel>Unit Type</InputLabel>
              <Select
                value={unitFilter}
                label="Unit Type"
                onChange={(e) => setUnitFilter(e.target.value)}
              >
                <MenuItem value="all">All Units</MenuItem>
                <MenuItem value="Watt">Watts (Power)</MenuItem>
                <MenuItem value="Degree Celsius">Temperature (°C)</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center">
                <SensorsIcon color="primary" sx={{ mr: 1 }} />
                <Box>
                  <Typography variant="h4" component="div">
                    {sensorSummary?.total_sensors || 0}
                  </Typography>
                  <Typography color="textSecondary">Total Sensors</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center">
                <ElectricIcon color="error" sx={{ mr: 1 }} />
                <Box>
                  <Typography variant="h4" component="div">
                    {sensorSummary?.watts_sensors || 0}
                  </Typography>
                  <Typography color="textSecondary">Power Sensors</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center">
                <ThermostatIcon color="info" sx={{ mr: 1 }} />
                <Box>
                  <Typography variant="h4" component="div">
                    {sensorSummary?.temperature_sensors || 0}
                  </Typography>
                  <Typography color="textSecondary">Temperature Sensors</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center">
                <MoreIcon color="default" sx={{ mr: 1 }} />
                <Box>
                  <Typography variant="h4" component="div">
                    {sensorSummary?.other_sensors || 0}
                  </Typography>
                  <Typography color="textSecondary">Other Sensors</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Energy Consumption Summary */}
      {consumptionSummary && (
        <Card sx={{ mb: 3 }}>
          <CardHeader title="Energy Consumption Summary" />
          <CardContent>
            <Grid container spacing={2}>
              <Grid item xs={12} md={3}>
                <Typography variant="h5" color="error.main">
                  {Math.round(consumptionSummary.total_watts).toLocaleString()} W
                </Typography>
                <Typography color="textSecondary">Total Power</Typography>
              </Grid>
              <Grid item xs={12} md={3}>
                <Typography variant="h5" color="primary.main">
                  {consumptionSummary.total_kwh?.toFixed(2)} kWh
                </Typography>
                <Typography color="textSecondary">Total Energy</Typography>
              </Grid>
              <Grid item xs={12} md={3}>
                <Typography variant="h5">
                  {Math.round(consumptionSummary.avg_watts).toLocaleString()} W
                </Typography>
                <Typography color="textSecondary">Average Power</Typography>
              </Grid>
              <Grid item xs={12} md={3}>
                <Typography variant="h6">
                  {consumptionSummary.total_records}
                </Typography>
                <Typography color="textSecondary">Data Points</Typography>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* Sensors Table */}
      <Card>
        <CardHeader title="Sensor Details" />
        <CardContent>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Unit</TableCell>
                  <TableCell>Latest Value</TableCell>
                  <TableCell>Location</TableCell>
                  <TableCell>Last Updated</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sensors.map((sensor) => (
                  <TableRow key={sensor.id}>
                    <TableCell>
                      <Typography variant="body2" fontWeight="medium">
                        {sensor.name}
                      </Typography>
                      {sensor.description && (
                        <Typography variant="caption" color="textSecondary">
                          {sensor.description}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={sensor.exact_type}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        icon={getUnitIcon(sensor.unit_name)}
                        label={sensor.unit_name || 'Unknown'}
                        size="small"
                        color={getUnitColor(sensor.unit_name) as any}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight="medium">
                        {formatValue(sensor.latest_value, sensor.unit_name)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {sensor.space_id ? 'Space' : sensor.floor_id ? 'Floor' : 'Building'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {sensor.latest_timestamp 
                          ? new Date(sensor.latest_timestamp).toLocaleString()
                          : 'No data'
                        }
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Box>
  );
}