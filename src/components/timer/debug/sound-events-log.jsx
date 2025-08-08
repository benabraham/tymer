import { recentSoundEvents, clearSoundEvents } from '../../../lib/sound-events'
import { formatTime } from '../../../lib/format'

export const SoundEventsLog = () => {
    const events = recentSoundEvents.value
    
    const formatEventType = (type) => {
        const typeMap = {
            'elapsed': '⏱️ Elapsed',
            'remaining': '⏰ Remaining',
            'periodEnd': '🔔 Period End',
            'overtime': '⚠️ Overtime',
            'overtimeLoop': '🔄 Loop'
        }
        return typeMap[type] || type
    }
    
    const formatSoundKey = (sound) => {
        if (typeof sound === 'number') {
            return `${sound} min`
        }
        if (sound.startsWith('continuous-')) {
            return sound.replace('continuous-', 'Continuous ')
        }
        return sound
    }
    
    return (
        <div className="sound-events-log">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <strong>Sound Events Log (Time-based only)</strong>
                <button 
                    onClick={clearSoundEvents}
                    style={{
                        fontSize: '12px',
                        padding: '2px 8px',
                        cursor: 'pointer'
                    }}
                >
                    Clear Log
                </button>
            </div>
            
            {events.length === 0 ? (
                <p style={{ fontSize: '12px', color: '#888' }}>No sound events yet</p>
            ) : (
                <div style={{ 
                    maxHeight: '200px', 
                    overflowY: 'auto',
                    fontSize: '12px',
                    fontFamily: 'monospace',
                    padding: '8px',
                    borderRadius: '4px'
                }}>
                    {events.map((event, index) => (
                        <div 
                            key={`${event.timestamp}-${index}`}
                            style={{ 
                                marginBottom: '6px',
                                paddingBottom: '6px',
                                borderBottom: index < events.length - 1 ? '1px solid #ddd' : 'none'
                            }}
                        >
                            <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>
                                {event.time} - {formatEventType(event.type)} - {formatSoundKey(event.sound)}
                            </div>
                            
                            {event.targetMinutes !== undefined && (
                                <div style={{ color: '#666' }}>
                                    Target: {event.targetMinutes} min
                                </div>
                            )}
                            
                            {event.beatenSounds > 0 && (
                                <div style={{ color: '#666' }}>
                                    Won over {event.beatenSounds} other sound{event.beatenSounds > 1 ? 's' : ''}
                                </div>
                            )}
                            
                            {event.allSounds && event.allSounds.length > 1 && (
                                <div style={{ color: '#999', fontSize: '10px' }}>
                                    Competing: {event.allSounds.join(', ')}
                                </div>
                            )}
                            
                            {event.nextPeriodType && (
                                <div style={{ color: '#666' }}>
                                    Next period: {event.nextPeriodType}
                                </div>
                            )}
                            
                            {event.elapsedMinutes !== undefined && (
                                <div style={{ color: '#666' }}>
                                    Elapsed: {event.elapsedMinutes} min
                                </div>
                            )}
                            
                            {event.action && (
                                <div style={{ color: event.action === 'start' ? '#0a0' : '#a00' }}>
                                    Action: {event.action}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
            
            <div style={{ 
                marginTop: '8px', 
                fontSize: '10px', 
                color: '#888' 
            }}>
                Showing {events.length} event{events.length !== 1 ? 's' : ''} (max 1000 stored)
            </div>
        </div>
    )
}