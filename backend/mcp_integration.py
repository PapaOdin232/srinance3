"""
MCP (Model Context Protocol) integration for sequential thinking and automated decision making.
This module provides automated connection management and optimization strategies.
"""

import asyncio
import aiohttp
import json
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

class MCPSequentialThinkingClient:
    """Client for communicating with MCP Sequential Thinking server"""
    
    def __init__(self, mcp_server_url: str = "http://localhost:3001"):
        self.server_url = mcp_server_url.rstrip('/')
        self.session: Optional[aiohttp.ClientSession] = None
        
    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
    
    async def think_sequential(self, problem: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Send a problem to MCP Sequential Thinking server for analysis
        
        Args:
            problem: Description of the problem to solve
            context: Additional context data
            
        Returns:
            Dictionary with thinking steps and solution
        """
        if not self.session:
            raise RuntimeError("Session not initialized. Use async context manager.")
        
        payload = {
            "type": "sequential_thinking",
            "problem": problem,
            "context": context,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        try:
            async with self.session.post(
                f"{self.server_url}/api/think",
                json=payload,
                timeout=aiohttp.ClientTimeout(total=30)
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    logger.error(f"MCP server error: {response.status}")
                    return {"error": f"Server returned {response.status}"}
                    
        except asyncio.TimeoutError:
            logger.error("MCP server timeout")
            return {"error": "Request timeout"}
        except Exception as e:
            logger.error(f"MCP client error: {e}")
            return {"error": str(e)}

class WebSocketConnectionOptimizer:
    """
    Uses MCP Sequential Thinking to optimize WebSocket connection management
    """
    
    def __init__(self, mcp_client: MCPSequentialThinkingClient):
        self.mcp_client = mcp_client
        self.connection_history: List[Dict[str, Any]] = []
        self.last_optimization = datetime.utcnow()
        
    async def analyze_connection_pattern(self, connection_metrics: Dict[str, Any]) -> Dict[str, Any]:
        """
        Analyze WebSocket connection patterns and suggest optimizations
        
        Args:
            connection_metrics: Current connection statistics
            
        Returns:
            Optimization recommendations
        """
        problem = f"""
        Analyze WebSocket connection performance and suggest optimizations.
        
        Current metrics:
        - Active connections: {connection_metrics.get('active_connections', 0)}
        - Failed connections: {connection_metrics.get('failed_connections', 0)}
        - Average response time: {connection_metrics.get('avg_response_time', 0)}ms
        - Reconnection attempts: {connection_metrics.get('reconnection_attempts', 0)}
        - Data throughput: {connection_metrics.get('data_throughput', 0)} msg/sec
        
        Historical patterns: {len(self.connection_history)} previous analyses
        
        Goals:
        1. Minimize connection failures
        2. Optimize response times
        3. Reduce server load
        4. Maintain data consistency
        """
        
        context = {
            "current_metrics": connection_metrics,
            "history": self.connection_history[-10:],  # Last 10 analyses
            "optimization_type": "websocket_performance"
        }
        
        result = await self.mcp_client.think_sequential(problem, context)
        
        # Store for future analysis
        self.connection_history.append({
            "timestamp": datetime.utcnow().isoformat(),
            "metrics": connection_metrics,
            "recommendations": result.get("solution", {})
        })
        
        return result
        
    async def should_reconnect(self, connection_state: Dict[str, Any]) -> bool:
        """
        Use MCP to decide whether to reconnect a failed WebSocket connection
        
        Args:
            connection_state: Current state of the connection
            
        Returns:
            True if should reconnect, False otherwise
        """
        problem = f"""
        Decide whether to reconnect a failed WebSocket connection.
        
        Connection state:
        - Connection ID: {connection_state.get('id', 'unknown')}
        - Failure reason: {connection_state.get('failure_reason', 'unknown')}
        - Attempts made: {connection_state.get('reconnect_attempts', 0)}
        - Last successful connection: {connection_state.get('last_success', 'never')}
        - Client priority: {connection_state.get('priority', 'normal')}
        
        Consider:
        1. Server capacity
        2. Client importance
        3. Failure patterns
        4. Resource usage
        """
        
        context = {
            "connection_state": connection_state,
            "decision_type": "reconnection_strategy"
        }
        
        result = await self.mcp_client.think_sequential(problem, context)
        
        # Extract boolean decision from MCP response
        solution = result.get("solution", {})
        return solution.get("should_reconnect", True)  # Default to reconnect

class MarketDataStreamOptimizer:
    """
    Uses MCP Sequential Thinking to optimize market data streaming strategies
    """
    
    def __init__(self, mcp_client: MCPSequentialThinkingClient):
        self.mcp_client = mcp_client
        
    async def optimize_update_frequency(self, stream_metrics: Dict[str, Any]) -> Dict[str, Any]:
        """
        Determine optimal update frequency for different data types
        
        Args:
            stream_metrics: Metrics about data streams
            
        Returns:
            Optimized update frequencies
        """
        problem = f"""
        Optimize market data update frequencies to balance real-time accuracy with performance.
        
        Current stream metrics:
        - Ticker updates: {stream_metrics.get('ticker_frequency', 0)} per second
        - Orderbook updates: {stream_metrics.get('orderbook_frequency', 0)} per second
        - Chart data updates: {stream_metrics.get('chart_frequency', 0)} per second
        - Active subscribers: {stream_metrics.get('active_subscribers', 0)}
        - Server CPU usage: {stream_metrics.get('cpu_usage', 0)}%
        - Memory usage: {stream_metrics.get('memory_usage', 0)}%
        
        Requirements:
        1. Ticker data should be near real-time (< 1s delay)
        2. Orderbook can tolerate slightly higher latency
        3. Chart data updates can be less frequent
        4. Must not overload server or clients
        """
        
        context = {
            "stream_metrics": stream_metrics,
            "optimization_target": "update_frequency"
        }
        
        result = await self.mcp_client.think_sequential(problem, context)
        return result.get("solution", {})

# Example usage in main.py
async def initialize_mcp_integration():
    """Initialize MCP integration for the FastAPI application"""
    global mcp_client, connection_optimizer, stream_optimizer
    
    try:
        mcp_client = MCPSequentialThinkingClient()
        connection_optimizer = WebSocketConnectionOptimizer(mcp_client)
        stream_optimizer = MarketDataStreamOptimizer(mcp_client)
        
        logger.info("MCP Sequential Thinking integration initialized")
        
    except Exception as e:
        logger.warning(f"MCP integration failed to initialize: {e}")
        mcp_client = None
        connection_optimizer = None
        stream_optimizer = None

# Global instances (to be set in main.py lifespan)
mcp_client: Optional[MCPSequentialThinkingClient] = None
connection_optimizer: Optional[WebSocketConnectionOptimizer] = None  
stream_optimizer: Optional[MarketDataStreamOptimizer] = None
