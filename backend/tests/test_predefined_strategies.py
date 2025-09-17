"""
Tests for predefined strategies module
"""

import pytest
from unittest.mock import patch, MagicMock
from backend.bot.predefined_strategies import (
    get_predefined_strategies,
    get_strategy_config,
    get_strategy_metadata,
    list_strategy_keys,
    validate_strategy_config,
    PREDEFINED_STRATEGIES
)


class TestPredefinedStrategies:
    """Test suite for predefined strategies functionality"""
    
    def test_get_predefined_strategies_returns_metadata_only(self):
        """Test that get_predefined_strategies returns only UI metadata"""
        strategies = get_predefined_strategies()
        
        assert isinstance(strategies, dict)
        assert len(strategies) > 0
        
        # Check each strategy has required metadata
        for key, strategy in strategies.items():
            assert "name" in strategy
            assert "description" in strategy
            assert "emoji" in strategy
            assert "tags" in strategy
            # Ensure config is NOT included in metadata
            assert "config" not in strategy
    
    def test_get_strategy_config_returns_complete_config(self):
        """Test that get_strategy_config returns complete strategy configuration"""
        # Test with known strategy
        config = get_strategy_config("conservative_scalping")
        
        assert isinstance(config, dict)
        assert "type" in config
        assert "symbol" in config
        assert "timeframe" in config
        assert "parameters" in config
        assert "risk_management" in config
        
        # Verify risk management fields
        risk_mgmt = config["risk_management"]
        required_risk_fields = ["max_position_size", "stop_loss_pct", "take_profit_pct", "max_daily_trades", "max_daily_loss"]
        for field in required_risk_fields:
            assert field in risk_mgmt
    
    def test_get_strategy_config_invalid_key_raises_error(self):
        """Test that invalid strategy key raises ValueError"""
        with pytest.raises(ValueError) as exc_info:
            get_strategy_config("invalid_strategy")
        
        assert "Unknown strategy" in str(exc_info.value)
        assert "invalid_strategy" in str(exc_info.value)
    
    def test_get_strategy_metadata_returns_ui_data(self):
        """Test that get_strategy_metadata returns UI data only"""
        metadata = get_strategy_metadata("aggressive_momentum")
        
        assert "name" in metadata
        assert "description" in metadata
        assert "emoji" in metadata
        assert "tags" in metadata
        assert "config" not in metadata
        
        assert metadata["name"] == "Aggressive Momentum"
        assert metadata["emoji"] == "🚀"
    
    def test_list_strategy_keys_returns_all_keys(self):
        """Test that list_strategy_keys returns all available strategy keys"""
        keys = list_strategy_keys()
        
        assert isinstance(keys, list)
        assert len(keys) == len(PREDEFINED_STRATEGIES)
        
        # Verify all keys from PREDEFINED_STRATEGIES are included
        for key in PREDEFINED_STRATEGIES.keys():
            assert key in keys
    
    def test_validate_strategy_config_valid_config(self):
        """Test validation with valid strategy config"""
        valid_config = {
            "type": "simple_ma",
            "symbol": "BTCUSDT",
            "timeframe": "1m",
            "parameters": {"ma_period": 20},
            "risk_management": {
                "max_position_size": 1000,
                "stop_loss_pct": 0.02,
                "take_profit_pct": 0.03,
                "max_daily_trades": 10,
                "max_daily_loss": 100
            }
        }
        
        assert validate_strategy_config(valid_config) is True
    
    def test_validate_strategy_config_missing_fields(self):
        """Test validation with missing required fields"""
        # Missing timeframe
        invalid_config = {
            "type": "simple_ma",
            "symbol": "BTCUSDT",
            "parameters": {},
            "risk_management": {
                "max_position_size": 1000,
                "stop_loss_pct": 0.02,
                "take_profit_pct": 0.03,
                "max_daily_trades": 10,
                "max_daily_loss": 100
            }
        }
        
        assert validate_strategy_config(invalid_config) is False
    
    def test_validate_strategy_config_invalid_risk_management(self):
        """Test validation with invalid risk management section"""
        invalid_config = {
            "type": "simple_ma",
            "symbol": "BTCUSDT", 
            "timeframe": "1m",
            "parameters": {},
            "risk_management": {
                "max_position_size": 1000,
                # Missing required fields
            }
        }
        
        assert validate_strategy_config(invalid_config) is False
    
    def test_all_predefined_strategies_are_valid(self):
        """Test that all predefined strategies pass validation"""
        for key, strategy in PREDEFINED_STRATEGIES.items():
            config = strategy["config"]
            assert validate_strategy_config(config), f"Strategy {key} failed validation"
    
    def test_strategy_config_is_copy_not_reference(self):
        """Test that get_strategy_config returns a copy, not reference"""
        config1 = get_strategy_config("conservative_scalping")
        config2 = get_strategy_config("conservative_scalping")
        
        # Modify one config
        config1["symbol"] = "ETHUSDT"
        
        # Other config should be unchanged
        assert config2["symbol"] == "BTCUSDT"
        assert config1 is not config2
    
    def test_predefined_strategies_have_required_structure(self):
        """Test that all predefined strategies have the required structure"""
        for key, strategy in PREDEFINED_STRATEGIES.items():
            # Check top-level structure
            assert "name" in strategy
            assert "description" in strategy
            assert "emoji" in strategy
            assert "tags" in strategy
            assert "config" in strategy
            
            # Check config structure
            config = strategy["config"]
            assert "type" in config
            assert "symbol" in config
            assert "timeframe" in config
            assert "parameters" in config
            assert "risk_management" in config
            
            # Check types
            assert isinstance(strategy["name"], str)
            assert isinstance(strategy["description"], str)
            assert isinstance(strategy["emoji"], str)
            assert isinstance(strategy["tags"], list)
            assert isinstance(config, dict)
    
    @pytest.mark.parametrize("strategy_key", [
        "conservative_scalping",
        "aggressive_momentum", 
        "stable_dca",
        "grid_ranging"
    ])
    def test_individual_strategies_work(self, strategy_key):
        """Test that each individual strategy can be retrieved and validated"""
        # Get metadata
        metadata = get_strategy_metadata(strategy_key)
        assert metadata["name"]
        assert metadata["description"]
        assert metadata["emoji"]
        
        # Get config
        config = get_strategy_config(strategy_key)
        assert validate_strategy_config(config)
        
        # Verify strategy type matches expected patterns
        strategy_type = config["type"]
        assert strategy_type in ["simple_ma", "rsi", "dca", "grid"]