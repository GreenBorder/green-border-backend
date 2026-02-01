class S3Client {
  async send(command) {
    const key = command.input.Key;

    if (key.includes('does-not-exist')) {
      return Promise.reject({ code: 'NoSuchKey' });
    }

    if (key.includes('invalid-json')) {
      return {
        Body: [
          Buffer.from('{ invalid json ')
        ]
      };
    }

    return {
      Body: [
        Buffer.from(JSON.stringify({
          type: 'FeatureCollection',
          features: []
        }))
      ]
    };
  }
}

class GetObjectCommand {
  constructor(input) {
    this.input = input;
  }
}

module.exports = {
  S3Client,
  GetObjectCommand
};
