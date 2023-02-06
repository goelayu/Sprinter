// GENERATED CODE -- DO NOT EDIT!

'use strict';
var grpc = require('@grpc/grpc-js');
var analyzer_pb = require('./analyzer_pb.js');

function serialize_proto_AzRequest(arg) {
  if (!(arg instanceof analyzer_pb.AzRequest)) {
    throw new Error('Expected argument of type proto.AzRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_proto_AzRequest(buffer_arg) {
  return analyzer_pb.AzRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_proto_AzResponse(arg) {
  if (!(arg instanceof analyzer_pb.AzResponse)) {
    throw new Error('Expected argument of type proto.AzResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_proto_AzResponse(buffer_arg) {
  return analyzer_pb.AzResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_proto_Pageaccess(arg) {
  if (!(arg instanceof analyzer_pb.Pageaccess)) {
    throw new Error('Expected argument of type proto.Pageaccess');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_proto_Pageaccess(buffer_arg) {
  return analyzer_pb.Pageaccess.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_proto_StoresigResponse(arg) {
  if (!(arg instanceof analyzer_pb.StoresigResponse)) {
    throw new Error('Expected argument of type proto.StoresigResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_proto_StoresigResponse(buffer_arg) {
  return analyzer_pb.StoresigResponse.deserializeBinary(new Uint8Array(buffer_arg));
}


var AnalyzerService = exports.AnalyzerService = {
  analyze: {
    path: '/proto.Analyzer/Analyze',
    requestStream: false,
    responseStream: false,
    requestType: analyzer_pb.AzRequest,
    responseType: analyzer_pb.AzResponse,
    requestSerialize: serialize_proto_AzRequest,
    requestDeserialize: deserialize_proto_AzRequest,
    responseSerialize: serialize_proto_AzResponse,
    responseDeserialize: deserialize_proto_AzResponse,
  },
  storesignature: {
    path: '/proto.Analyzer/Storesignature',
    requestStream: false,
    responseStream: false,
    requestType: analyzer_pb.Pageaccess,
    responseType: analyzer_pb.StoresigResponse,
    requestSerialize: serialize_proto_Pageaccess,
    requestDeserialize: deserialize_proto_Pageaccess,
    responseSerialize: serialize_proto_StoresigResponse,
    responseDeserialize: deserialize_proto_StoresigResponse,
  },
};

exports.AnalyzerClient = grpc.makeGenericClientConstructor(AnalyzerService);
