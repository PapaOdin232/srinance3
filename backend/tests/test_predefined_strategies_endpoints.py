"""
Tests for new predefined strategies API endpoints
"""

import pytest
import asyncio
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from fastapi import HTTPException


class TestPredefinedStrategiesEndpoints:
    """Test suite for predefined strategies API endpoints"""
    
    @pytest.fixture
    def client(self):
        """Create test client"""
        # This will be implemented when we have the full app setup
        # For now, we'll mock the endpoints
        pass
    
    @patch('backend.main.trading_bot')
    @pytest.mark.asyncio
    async def test_get_predefined_strategies_success(self, mock_bot):
        """Test successful retrieval of predefined strategies"""
        from backend.main import get_predefined_strategies
        
        # Mock the function import and execution
        with patch('backend.main.get_predefined_strategies') as mock_get_strategies:
            mock_strategies = {
                "conservative_scalping": {
                    "name": "Conservative Scalping",
                    "description": "Safe scalping strategy",
                    "emoji": "🛡️",
                    "tags": ["Low Risk"]
                }
            }
            mock_get_strategies.return_value = mock_strategies
            
            # Call endpoint function directly
            result = await get_predefined_strategies()
            
            assert result == {"strategies": mock_strategies}
    
    @patch('backend.main.trading_bot')
    @pytest.mark.asyncio
    async def test_get_predefined_strategies_error_handling(self, mock_bot):
        """Test error handling in get_predefined_strategies endpoint"""
        from backend.main import get_predefined_strategies
        
        with patch('backend.main.get_predefined_strategies') as mock_get_strategies:
            mock_get_strategies.side_effect = Exception("Test error")
            
            with pytest.raises(HTTPException) as exc_info:
                await get_predefined_strategies()
            
            assert exc_info.value.status_code == 500
            assert "Test error" in str(exc_info.value.detail)
    
    @patch('backend.main.trading_bot')
    @pytest.mark.asyncio
    async def test_select_predefined_strategy_success(self, mock_bot):
        """Test successful strategy selection"""
        from backend.main import select_predefined_strategy
        
        # Mock trading bot
        mock_bot.update_strategy_config.return_value = True
        
        # Mock strategy functions
        with patch('backend.main.get_strategy_config') as mock_get_config, \
             patch('backend.main.get_strategy_metadata') as mock_get_metadata:
            
            mock_config = {
                "type": "simple_ma",
                "symbol": "BTCUSDT",
                "timeframe": "1m",
                "parameters": {"ma_period": 20},
                "risk_management": {
                    "max_position_size": 100,
                    "stop_loss_pct": 0.005,
                    "take_profit_pct": 0.01,
                    "max_daily_trades": 20,
                    "max_daily_loss": 50
                }
            }
            mock_metadata = {
                "name": "Conservative Scalping",
                "description": "Safe strategy",
                "emoji": "🛡️",
                "tags": ["Low Risk"]
            }
            
            mock_get_config.return_value = mock_config
            mock_get_metadata.return_value = mock_metadata
            
            # Test request
            strategy_data = {"strategy_key": "conservative_scalping"}
            result = await select_predefined_strategy(strategy_data)
            
            # Verify result
            assert "message" in result
            assert "Conservative Scalping" in result["message"]
            assert result["strategy_key"] == "conservative_scalping"
            assert result["config"] == mock_config
            assert result["metadata"] == mock_metadata
            
            # Verify bot was called
            mock_bot.update_strategy_config.assert_called_once_with(mock_config)
    
    @pytest.mark.asyncio
    async def test_select_predefined_strategy_missing_key(self):
        """Test strategy selection with missing strategy_key"""
        from backend.main import select_predefined_strategy
        
        strategy_data = {}  # Missing strategy_key
        
        with pytest.raises(HTTPException) as exc_info:
            await select_predefined_strategy(strategy_data)
        
        assert exc_info.value.status_code == 400
        assert "strategy_key is required" in str(exc_info.value.detail)
    
    @patch('backend.main.trading_bot', None)
    @pytest.mark.asyncio
    async def test_select_predefined_strategy_no_bot(self):
        """Test strategy selection when bot is not available"""
        from backend.main import select_predefined_strategy
        
        strategy_data = {"strategy_key": "conservative_scalping"}
        
        with pytest.raises(HTTPException) as exc_info:
            await select_predefined_strategy(strategy_data)
        
        assert exc_info.value.status_code == 503
        assert "Bot not available" in str(exc_info.value.detail)
    
    @patch('backend.main.trading_bot')
    @pytest.mark.asyncio
    async def test_select_predefined_strategy_invalid_key(self, mock_bot):
        """Test strategy selection with invalid strategy key"""
        from backend.main import select_predefined_strategy
        
        with patch('backend.main.get_strategy_config') as mock_get_config:
            mock_get_config.side_effect = ValueError("Unknown strategy: invalid_key")
            
            strategy_data = {"strategy_key": "invalid_key"}
            
            with pytest.raises(HTTPException) as exc_info:
                await select_predefined_strategy(strategy_data)
            
            assert exc_info.value.status_code == 400
            assert "Unknown strategy" in str(exc_info.value.detail)
    
    @patch('backend.main.trading_bot')
    @pytest.mark.asyncio
    async def test_select_predefined_strategy_bot_update_fails(self, mock_bot):
        """Test strategy selection when bot config update fails"""
        from backend.main import select_predefined_strategy
        
        # Mock bot update to return False (failure)
        mock_bot.update_strategy_config.return_value = False
        
        with patch('backend.main.get_strategy_config') as mock_get_config, \
             patch('backend.main.get_strategy_metadata') as mock_get_metadata:
            
            mock_get_config.return_value = {"type": "simple_ma"}
            mock_get_metadata.return_value = {"name": "Test Strategy"}
            
            strategy_data = {"strategy_key": "conservative_scalping"}
            
            with pytest.raises(HTTPException) as exc_info:
                await select_predefined_strategy(strategy_data)
            
            assert exc_info.value.status_code == 500
            assert "Failed to apply strategy configuration" in str(exc_info.value.detail)


class TestPredefinedStrategiesIntegration:
    """Integration tests for predefined strategies with trading bot"""
    
    @patch('backend.bot.predefined_strategies.PREDEFINED_STRATEGIES')
    def test_strategies_integration_with_trading_bot(self, mock_strategies):
        """Test that predefined strategies work with actual trading bot interface"""
        # Mock a simple strategy
        mock_strategies = {
            "test_strategy": {
                "name": "Test Strategy",
                "description": "Test description",
                "emoji": "🧪", 
                "tags": ["Test"],
                "config": {
                    "type": "simple_ma",
                    "symbol": "BTCUSDT",
                    "timeframe": "1m",
                    "parameters": {"ma_period": 20},
                    "risk_management": {
                        "max_position_size": 100,
                        "stop_loss_pct": 0.01,
                        "take_profit_pct": 0.02,
                        "max_daily_trades": 10,
                        "max_daily_loss": 50
                    }
                }
            }
        }
        
        from backend.bot.predefined_strategies import get_strategy_config
        
        # This should work without errors
        config = get_strategy_config("test_strategy")
        assert config["type"] == "simple_ma"
        assert config["symbol"] == "BTCUSDT"
    
    def test_all_predefined_strategies_have_valid_types(self):
        """Test that all predefined strategies use valid strategy types"""
        from backend.bot.predefined_strategies import PREDEFINED_STRATEGIES
        
        valid_types = ["simple_ma", "rsi", "grid", "dca"]
        
        for key, strategy in PREDEFINED_STRATEGIES.items():
            strategy_type = strategy["config"]["type"]
            assert strategy_type in valid_types, f"Strategy {key} has invalid type: {strategy_type}"
    
    def test_risk_management_values_are_reasonable(self):
        """Test that risk management values in strategies are reasonable"""
        from backend.bot.predefined_strategies import PREDEFINED_STRATEGIES
        
        for key, strategy in PREDEFINED_STRATEGIES.items():
            risk_mgmt = strategy["config"]["risk_management"]
            
            # Check reasonable ranges
            assert 0 < risk_mgmt["max_position_size"] <= 10000, f"Strategy {key} has unreasonable position size"
            assert 0 < risk_mgmt["stop_loss_pct"] <= 0.5, f"Strategy {key} has unreasonable stop loss"  
            assert 0 < risk_mgmt["take_profit_pct"] <= 1.0, f"Strategy {key} has unreasonable take profit"
            assert 1 <= risk_mgmt["max_daily_trades"] <= 100, f"Strategy {key} has unreasonable daily trades limit"
            assert 0 < risk_mgmt["max_daily_loss"] <= 1000, f"Strategy {key} has unreasonable daily loss limit"